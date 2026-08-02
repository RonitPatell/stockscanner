/**
 * Continuously maintained Monitor Snapshot service (server-side).
 * Active snapshot lives in Redis before any browser opens Monitor.
 */

import { getRedis } from "@/lib/redis";
import {
  getMonitorDeliveryHub,
  ingestAndProcessMonitorEvents,
} from "@/lib/monitor/delivery/server-hub";
import type { MonitorPublicSnapshot } from "@/domain/monitor/snapshot";
import {
  needsSnapshotUpgrade,
  publicSnapshotToDeliverySymbols,
  upgradeMonitorPublicSnapshot,
} from "@/domain/monitor/snapshot";
import type { NormalizedMarketEvent } from "@/domain/monitor/delivery";
import {
  MonitorSnapshotRedisStore,
  __resetMonitorSnapshotMemoryForTests,
  type SnapshotRedisLike,
} from "./redis-store";
import { MonitorSnapshotPublisher } from "./publisher";
import { buildInputFromDeliveryHub } from "./from-delivery-hub";
import {
  listRecentSnapshotBuildErrors,
  loadLatestDurableMonitorSnapshot,
  persistDurableMonitorSnapshot,
  recordMonitorSnapshotBuildError,
} from "./durable-store";
import { getSessionContext } from "../../../domain/monitor/market-state/session.ts";
import { workersUnhealthyForMonitor } from "../../workers/market-readiness.ts";
import { listMonitorOpsQuality } from "../ops/quality-store";

const g = globalThis as typeof globalThis & {
  __ttMonitorSnapshotPublisher?: MonitorSnapshotPublisher;
};

function upstashAsSnapshotRedis(): SnapshotRedisLike | null {
  const redis = getRedis();
  if (!redis) return null;
  return {
    get: (key) => redis.get<string>(key),
    set: async (key, value, opts) => {
      if (opts?.nx) {
        return redis.set(key, value, { nx: true, ex: opts.ex });
      }
      if (opts?.ex != null) {
        return redis.set(key, value, { ex: opts.ex });
      }
      return redis.set(key, value);
    },
    del: (...keys) => redis.del(...keys),
  };
}

export function getMonitorSnapshotPublisher(): MonitorSnapshotPublisher {
  if (!g.__ttMonitorSnapshotPublisher) {
    const redis = upstashAsSnapshotRedis();
    const store = new MonitorSnapshotRedisStore(redis);
    g.__ttMonitorSnapshotPublisher = new MonitorSnapshotPublisher({
      store,
      durablePersist: persistDurableMonitorSnapshot,
      recordError: recordMonitorSnapshotBuildError,
    });
  }
  return g.__ttMonitorSnapshotPublisher;
}

export function __resetMonitorSnapshotServiceForTests(): void {
  __resetMonitorSnapshotMemoryForTests();
  g.__ttMonitorSnapshotPublisher = undefined;
}

/** Active public snapshot (Redis / memory). Null if never published. */
export async function getActiveMonitorPublicSnapshot(): Promise<MonitorPublicSnapshot | null> {
  return getMonitorSnapshotPublisher().getActive();
}

/**
 * Rebuild from the delivery hub (normalized envelopes already on the server)
 * and publish through coalesce / freshness rules.
 */
export async function publishMonitorSnapshotFromHub(opts?: {
  flush?: boolean;
  recovery?: boolean;
}): Promise<unknown> {
  const hub = getMonitorDeliveryHub();
  const publisher = getMonitorSnapshotPublisher();
  let conflictedSymbols: string[] = [];
  try {
    const quality = await listMonitorOpsQuality(60);
    conflictedSymbols = [
      ...new Set(
        quality
          .filter((e) => e.kind === "ambiguous_ticker")
          .flatMap((e) => {
            const raw = String(e.symbol ?? "").toUpperCase();
            const candidates = String(e.meta?.candidates ?? "")
              .split(",")
              .map((s) => s.trim().toUpperCase())
              .filter(Boolean);
            return [raw, ...candidates].filter(Boolean);
          })
      ),
    ];
  } catch {
    conflictedSymbols = [];
  }
  const input = buildInputFromDeliveryHub(hub, {
    nowMs: Date.now(),
    conflictedSymbols,
  });
  if (opts?.recovery) input.recovery = true;
  publisher.schedule(input, opts?.recovery ? "recovery" : "event");
  if (opts?.flush !== false) {
    return publisher.flush(opts?.recovery ? "recovery" : "manual");
  }
  return { ok: true, scheduled: true };
}

/**
 * Graceful restart: if Redis has no active snapshot, restore the latest
 * durable PG snapshot into Redis (recovery flag) so clients never wait on traffic.
 */
export async function recoverMonitorSnapshotFromDurable(): Promise<{
  recovered: boolean;
  snapshotId: string | null;
}> {
  const publisher = getMonitorSnapshotPublisher();
  const active = await publisher.getActive();
  if (active) {
    return { recovered: false, snapshotId: active.snapshotId };
  }
  const durable = await loadLatestDurableMonitorSnapshot();
  if (!durable) {
    await recordMonitorSnapshotBuildError({
      stage: "recovery",
      message: "No durable snapshot available for restart recovery",
    });
    return { recovered: false, snapshotId: null };
  }
  const nowMs = Date.now();
  const session = getSessionContext(nowMs).segment;
  const base = needsSnapshotUpgrade(durable)
    ? upgradeMonitorPublicSnapshot(durable, {
        nowMs,
        recovery: true,
        marketSession: session,
      })
    : durable;
  const candidate: MonitorPublicSnapshot = {
    ...base,
    marketSession: session,
    recovery: true,
    dataQuality:
      base.dataQuality === "high" ? "degraded" : base.dataQuality,
    // Serialization clock only — underlying provider times stay on tickers.
    generatedAtMs: nowMs,
    generatedAt: new Date(nowMs).toISOString(),
    freshness: {
      ...(base.freshness ?? {
        snapshotAgeMs: 0,
        underlyingDataAgeMs: base.marketStateAgeMs,
        liveEligible: false,
        liveLabel: "recovery" as const,
        excludedTickers: [],
        leaderExclusions: [],
        generationDurationMs: null,
        schemaVersion: base.schemaVersion,
        calculationVersion: base.calculationVersion,
      }),
      liveEligible: false,
      liveLabel: "recovery",
      snapshotAgeMs: 0,
    },
  };
  const result = await publisher.getStore().publish(candidate);
  if (!result.ok) {
    await recordMonitorSnapshotBuildError({
      stage: "recovery",
      message: `Durable republish failed: ${result.reason}`,
    });
    return { recovered: false, snapshotId: null };
  }
  return { recovered: true, snapshotId: result.snapshotId };
}

/** Force a CLOSED-session republish of the active (or durable) snapshot. */
export async function publishClosedMarketSnapshot(): Promise<unknown> {
  const publisher = getMonitorSnapshotPublisher();
  let active = await publisher.getActive();
  if (!active) {
    await recoverMonitorSnapshotFromDurable();
    active = await publisher.getActive();
  }
  if (!active) {
    return publishMonitorSnapshotFromHub({ flush: true, recovery: true });
  }
  const nowMs = Date.now();
  const upgraded = needsSnapshotUpgrade(active)
    ? upgradeMonitorPublicSnapshot(active, {
        nowMs,
        recovery: true,
        marketSession: "closed",
      })
    : active;
  const candidate: MonitorPublicSnapshot = {
    ...upgraded,
    marketSession: "closed",
    generatedAtMs: nowMs,
    generatedAt: new Date(nowMs).toISOString(),
    recovery: true,
    freshness: {
      ...(upgraded.freshness ?? {
        snapshotAgeMs: 0,
        underlyingDataAgeMs: upgraded.marketStateAgeMs,
        liveEligible: false,
        liveLabel: "recovery" as const,
        excludedTickers: [],
        leaderExclusions: [],
        generationDurationMs: null,
        schemaVersion: upgraded.schemaVersion,
        calculationVersion: upgraded.calculationVersion,
      }),
      liveEligible: false,
      liveLabel: "recovery",
      snapshotAgeMs: 0,
    },
  };
  return publisher.getStore().publish(candidate);
}

/** Cron upper-bound: ensure snapshot cannot remain stale indefinitely. */
export async function tickMonitorSnapshotService(): Promise<{
  recovered: { recovered: boolean; snapshotId: string | null };
  fromHub: unknown;
  freshness: unknown;
  workersUnhealthy: boolean;
  session: string;
}> {
  const nowMs = Date.now();
  const session = getSessionContext(nowMs).segment;
  const recovered = await recoverMonitorSnapshotFromDurable();
  const unhealthy = await workersUnhealthyForMonitor(nowMs);

  let fromHub: unknown;
  if (session === "closed") {
    fromHub = await publishClosedMarketSnapshot();
  } else {
    fromHub = await publishMonitorSnapshotFromHub({
      flush: true,
      recovery: unhealthy || recovered.recovered,
    });
  }

  const freshness = await getMonitorSnapshotPublisher().ensureFreshness();

  if (unhealthy) {
    const active = await getActiveMonitorPublicSnapshot();
    if (active && active.dataQuality === "high") {
      const degraded = needsSnapshotUpgrade(active)
        ? upgradeMonitorPublicSnapshot(active, {
            nowMs,
            recovery: true,
            marketSession: session,
          })
        : active;
      await getMonitorSnapshotPublisher().getStore().publish({
        ...degraded,
        dataQuality: "degraded",
        recovery: true,
        generatedAtMs: nowMs,
        generatedAt: new Date(nowMs).toISOString(),
        marketSession: session,
        freshness: {
          ...(degraded.freshness ?? {
            snapshotAgeMs: 0,
            underlyingDataAgeMs: degraded.marketStateAgeMs,
            liveEligible: false,
            liveLabel: "recovery" as const,
            excludedTickers: [],
            leaderExclusions: [],
            generationDurationMs: null,
            schemaVersion: degraded.schemaVersion,
            calculationVersion: degraded.calculationVersion,
          }),
          liveEligible: false,
          liveLabel: "recovery",
          snapshotAgeMs: 0,
        },
      });
    }
  }

  return {
    recovered,
    fromHub,
    freshness,
    workersUnhealthy: unhealthy,
    session,
  };
}

/**
 * Optional: push published ladder symbols back into the delivery hub so SSE
 * clients stay aligned with the Redis public snapshot.
 */
export async function syncDeliveryHubFromPublicSnapshot(
  snap: MonitorPublicSnapshot
): Promise<number> {
  const rows = publicSnapshotToDeliverySymbols(snap);
  const events: NormalizedMarketEvent[] = rows.map((r) => ({
    symbol: r.symbol,
    observedAtMs: r.asOfMs,
    ingestedAtMs: Date.now(),
    price: null,
    changePercent: null,
    relativeVolume: null,
    tradesPerSecond: null,
    halted: r.halted,
    criticalEvent: r.criticalEvent,
    momentumState: r.momentumState,
    momentumIntensity: r.momentumIntensity,
    attentionPriority: r.attentionPriority,
    direction: r.direction,
    availability: r.stale ? "stale" : "ok",
  }));
  if (!events.length) return 0;
  const result = await ingestAndProcessMonitorEvents(events, { persist: false });
  return result.processed;
}

export async function getMonitorSnapshotDiagnostics() {
  const publisher = getMonitorSnapshotPublisher();
  const active = await publisher.getActive();
  const previous = await publisher.getStore().getPrevious();
  const errors = await listRecentSnapshotBuildErrors(40).catch(() => []);
  const nowMs = Date.now();

  let conflictedFromQuality: string[] = [];
  try {
    const quality = await listMonitorOpsQuality(80);
    conflictedFromQuality = quality
      .filter((e) => e.kind === "ambiguous_ticker")
      .map((e) => String(e.symbol ?? e.meta?.raw ?? "").toUpperCase())
      .filter(Boolean);
  } catch {
    conflictedFromQuality = [];
  }

  const snapshotAgeMs = active ? Math.max(0, nowMs - active.generatedAtMs) : null;
  const underlyingDataAgeMs =
    active?.freshness?.underlyingDataAgeMs ?? active?.marketStateAgeMs ?? null;

  const staleTickers =
    active?.priorityLadder
      .filter(
        (t) =>
          t.freshnessVerdict === "stale" ||
          t.freshnessVerdict === "unavailable" ||
          t.freshnessVerdict === "quarantined"
      )
      .map((t) => ({
        symbol: t.symbol,
        freshnessVerdict: t.freshnessVerdict,
        lastQuoteAtMs: t.lastQuoteAtMs,
        lastMarketEventAtMs: t.lastMarketEventAtMs,
        leaderEligible: t.leaderEligible,
        leaderIneligibleReason: t.leaderIneligibleReason,
        fieldFreshness: t.fieldFreshness,
        sourceHealth: t.sourceHealth,
      })) ?? [];

  const validationFailures = errors.filter(
    (e) =>
      e.stage === "publish" ||
      e.stage === "flush" ||
      e.message.includes("validation")
  );

  const exclusions = errors.filter((e) => e.stage === "exclusion");

  return {
    publisher: publisher.diagnostics(),
    schemaVersion: active?.schemaVersion ?? null,
    calculationVersion: active?.calculationVersion ?? null,
    currentSnapshotId: active?.snapshotId ?? null,
    previousSnapshotId: previous?.snapshotId ?? null,
    snapshotAgeMs,
    underlyingDataAgeMs,
    generationDurationMs:
      active?.freshness?.generationDurationMs ?? null,
    liveLabel: active?.freshness?.liveLabel ?? null,
    liveEligible: active?.freshness?.liveEligible ?? false,
    sourceHealth: active?.sourceHealthSummary ?? null,
    excludedTickers: active?.freshness?.excludedTickers ?? [],
    leaderExclusions: active?.freshness?.leaderExclusions ?? [],
    staleTickers,
    conflictedMappings: [...new Set(conflictedFromQuality)].slice(0, 40),
    failedValidation: validationFailures.slice(0, 20).map((e) => ({
      id: e.id,
      stage: e.stage,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
    exclusionLog: exclusions.slice(0, 20).map((e) => ({
      id: e.id,
      stage: e.stage,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
    active: active
      ? {
          snapshotId: active.snapshotId,
          lastEventId: active.lastEventId,
          generatedAt: active.generatedAt,
          generatedAtMs: active.generatedAtMs,
          leader: active.globalLeader,
          ladderSize: active.priorityLadder.length,
          fieldSize: active.momentumField.length,
          tapeSize: active.recentEventTape.length,
          dataQuality: active.dataQuality,
          recovery: active.recovery,
          marketSession: active.marketSession,
          freshness: active.freshness,
          tickers: active.priorityLadder.map((t) => ({
            symbol: t.symbol,
            rank: t.rank,
            freshnessVerdict: t.freshnessVerdict,
            snapshotGeneratedAtMs: t.snapshotGeneratedAtMs,
            lastMarketEventAtMs: t.lastMarketEventAtMs,
            lastQuoteAtMs: t.lastQuoteAtMs,
            lastTradeAtMs: t.lastTradeAtMs,
            lastCatalystAtMs: t.lastCatalystAtMs,
            momentumCalculatedAtMs: t.momentumCalculatedAtMs,
            priorityCalculatedAtMs: t.priorityCalculatedAtMs,
            tradeabilityCalculatedAtMs: t.tradeabilityCalculatedAtMs,
            leaderEligible: t.leaderEligible,
            leaderIneligibleReason: t.leaderIneligibleReason,
            sourceHealth: t.sourceHealth,
            calculationVersion: t.calculationVersion,
          })),
        }
      : null,
    previous: previous
      ? {
          snapshotId: previous.snapshotId,
          lastEventId: previous.lastEventId,
          generatedAt: previous.generatedAt,
          generatedAtMs: previous.generatedAtMs,
          leader: previous.globalLeader,
          dataQuality: previous.dataQuality,
          liveLabel: previous.freshness?.liveLabel ?? null,
        }
      : null,
    recentErrors: errors.slice(0, 20).map((e) => ({
      id: e.id,
      stage: e.stage,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export async function rollbackMonitorSnapshot(): Promise<MonitorPublicSnapshot | null> {
  const snap = await getMonitorSnapshotPublisher().getStore().rollbackToPrevious();
  if (!snap) {
    await recordMonitorSnapshotBuildError({
      stage: "rollback",
      message: "No valid previous snapshot to restore",
    });
  }
  return snap;
}
