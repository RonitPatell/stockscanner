/**
 * Snapshot publication update model:
 * - rebuild / incremental on meaningful events
 * - coalesce rapid updates
 * - upper-bound interval so snapshots cannot stay unchanged forever
 * - monotonic event ids; recovery flag for older data
 */

import {
  buildMonitorPublicSnapshot,
  MONITOR_SNAPSHOT_COALESCE_MS,
  MONITOR_SNAPSHOT_MAX_PUBLISH_INTERVAL_MS,
  type MonitorPublicSnapshot,
  type MonitorSnapshotBuildInput,
} from "../../../domain/monitor/snapshot/index.ts";
import {
  MonitorSnapshotRedisStore,
  type SnapshotPublishResult,
} from "./redis-store.ts";

export interface SnapshotPublisherConfig {
  coalesceMs?: number;
  maxIntervalMs?: number;
  /** Persist to PostgreSQL at most this often (0 = every successful publish). */
  durableIntervalMs?: number;
  store?: MonitorSnapshotRedisStore;
  nowMs?: () => number;
  durablePersist?: (
    snap: MonitorPublicSnapshot
  ) => Promise<{ ok: boolean; error?: string }>;
  recordError?: (input: {
    stage: string;
    message: string;
    detail?: Record<string, unknown> | null;
  }) => Promise<void>;
}

export type PublishTrigger =
  | "event"
  | "interval"
  | "recovery"
  | "manual"
  | "coalesced";

export class MonitorSnapshotPublisher {
  private readonly store: MonitorSnapshotRedisStore;
  private readonly coalesceMs: number;
  private readonly maxIntervalMs: number;
  private readonly durableIntervalMs: number;
  private readonly nowMs: () => number;
  private readonly durablePersist?: SnapshotPublisherConfig["durablePersist"];
  private readonly recordError?: SnapshotPublisherConfig["recordError"];

  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingInput: MonitorSnapshotBuildInput | null = null;
  private lastPublishMs = 0;
  private lastDurableMs = 0;
  private lastEventId: string | null = null;
  private publishing = false;

  constructor(config?: SnapshotPublisherConfig) {
    this.store = config?.store ?? new MonitorSnapshotRedisStore();
    this.coalesceMs = config?.coalesceMs ?? MONITOR_SNAPSHOT_COALESCE_MS;
    this.maxIntervalMs =
      config?.maxIntervalMs ?? MONITOR_SNAPSHOT_MAX_PUBLISH_INTERVAL_MS;
    this.durableIntervalMs = config?.durableIntervalMs ?? 60_000;
    this.nowMs = config?.nowMs ?? (() => Date.now());
    this.durablePersist = config?.durablePersist;
    this.recordError = config?.recordError;
  }

  getStore(): MonitorSnapshotRedisStore {
    return this.store;
  }

  async getActive(): Promise<MonitorPublicSnapshot | null> {
    return this.store.getActive();
  }

  /**
   * Queue a normalized rebuild. Coalesces bursts unless `immediate` or the
   * upper-bound publish interval has elapsed (caller should await flush).
   */
  schedule(
    input: MonitorSnapshotBuildInput,
    trigger: PublishTrigger = "event"
  ): { shouldFlushNow: boolean } {
    const prev = this.pendingInput;
    this.pendingInput = prev
      ? {
          ...input,
          lastEventId: preferEventId(prev.lastEventId, input.lastEventId),
          tickers: mergeTickers(prev.tickers, input.tickers),
          tapeEvents: mergeTape(prev.tapeEvents, input.tapeEvents),
          previous: input.previous ?? prev.previous,
          recovery: Boolean(input.recovery || prev.recovery),
        }
      : input;

    const elapsed = this.nowMs() - this.lastPublishMs;
    const shouldFlushNow =
      trigger === "interval" ||
      trigger === "manual" ||
      trigger === "recovery" ||
      (this.lastPublishMs > 0 && elapsed >= this.maxIntervalMs);

    if (shouldFlushNow) {
      if (this.coalesceTimer) {
        clearTimeout(this.coalesceTimer);
        this.coalesceTimer = null;
      }
      return { shouldFlushNow: true };
    }

    if (!this.coalesceTimer) {
      this.coalesceTimer = setTimeout(() => {
        this.coalesceTimer = null;
        void this.flush("coalesced");
      }, this.coalesceMs);
    }
    return { shouldFlushNow: false };
  }

  async flush(
    trigger: PublishTrigger = "manual"
  ): Promise<SnapshotPublishResult> {
    if (this.publishing) {
      return { ok: false, reason: "lock_busy" };
    }
    const input = this.pendingInput;
    if (!input) {
      return { ok: false, reason: "not_renderable" };
    }
    this.publishing = true;
    try {
      const active = await this.store.getActive();
      const buildStarted = this.nowMs();
      const built = buildMonitorPublicSnapshot({
        ...input,
        nowMs: input.nowMs || buildStarted,
        previous: input.previous ?? active,
        recovery: trigger === "recovery" ? true : input.recovery,
        generationDurationMs: null,
      });
      const generationDurationMs = Math.max(0, this.nowMs() - buildStarted);
      built.freshness = {
        ...built.freshness,
        generationDurationMs,
        snapshotAgeMs: 0,
      };

      const materialExclusions = built.freshness.excludedTickers.filter(
        (e) =>
          e.stage === "resolve" ||
          e.stage === "quarantine" ||
          e.stage === "validate" ||
          e.stage === "freshness"
      );
      if (materialExclusions.length) {
        await this.safeError("exclusion", "tickers_excluded_from_snapshot", {
          trigger,
          snapshotId: built.snapshotId,
          excluded: materialExclusions.slice(0, 50),
          leaderExclusions: built.freshness.leaderExclusions.slice(0, 20),
          leader: built.globalLeader,
          liveLabel: built.freshness.liveLabel,
        });
      }

      const result = await this.store.publish(built);
      if (!result.ok) {
        // Failed publish must not discard the last valid active snapshot.
        await this.safeError("publish", result.reason, {
          trigger,
          issues: "issues" in result ? result.issues : undefined,
          lastEventId: built.lastEventId,
          keptActiveSnapshotId: active?.snapshotId ?? null,
          generationDurationMs,
        });
        return result;
      }

      this.lastPublishMs = this.nowMs();
      this.lastEventId = built.lastEventId;
      this.pendingInput = null;

      if (
        this.durablePersist &&
        (this.durableIntervalMs <= 0 ||
          this.nowMs() - this.lastDurableMs >= this.durableIntervalMs)
      ) {
        const persisted = await this.durablePersist(built);
        if (persisted.ok) {
          this.lastDurableMs = this.nowMs();
        } else {
          await this.safeError("durable_persist", persisted.error ?? "failed", {
            snapshotId: built.snapshotId,
          });
        }
      }

      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "flush_failed";
      await this.safeError("flush", message, { trigger });
      return { ok: false, reason: "store_error" };
    } finally {
      this.publishing = false;
    }
  }

  async ensureFreshness(): Promise<
    SnapshotPublishResult | { ok: true; skipped: true }
  > {
    const elapsed = this.nowMs() - this.lastPublishMs;
    if (this.pendingInput) {
      return this.flush("interval");
    }
    if (this.lastPublishMs > 0 && elapsed < this.maxIntervalMs) {
      return { ok: true, skipped: true };
    }
    const active = await this.store.getActive();
    if (!active) return { ok: true, skipped: true };
    this.pendingInput = {
      nowMs: this.nowMs(),
      lastEventId: active.lastEventId,
      marketSession: active.marketSession,
      tickers: active.priorityLadder.map((t) => ({
        symbol: t.symbol,
        companyShortName: t.companyShortName,
        price: t.price,
        sessionChangePct: t.sessionChangePct,
        attentionPriority: t.attentionPriority ?? 0,
        momentumIntensity: t.momentumIntensity,
        momentumState: t.momentumState,
        direction: t.direction,
        reactionStage: t.reactionStage,
        tradeability: t.tradeability,
        primaryRisk: t.primaryRisk,
        catalyst: t.catalyst,
        quoteTimestampMs: t.quoteTimestampMs ?? t.lastQuoteAtMs,
        lastQuoteAtMs: t.lastQuoteAtMs ?? t.quoteTimestampMs,
        lastTradeAtMs: t.lastTradeAtMs,
        lastCatalystAtMs: t.lastCatalystAtMs,
        lastMarketEventAtMs: t.lastMarketEventAtMs,
        momentumCalculatedAtMs: t.momentumCalculatedAtMs,
        priorityCalculatedAtMs: t.priorityCalculatedAtMs,
        tradeabilityCalculatedAtMs: t.tradeabilityCalculatedAtMs,
        activityLevel: t.activityLevel,
        sourceHealth: t.sourceHealth,
        dataConfidence: t.dataConfidence,
        haltState: t.haltState,
        previousRank: t.rank,
      })),
      tapeEvents: active.recentEventTape,
      sourceHealth: active.sourceHealthSummary,
      marketStateAgeMs: active.marketStateAgeMs,
      dataQuality: active.dataQuality,
      previous: active,
    };
    return this.flush("interval");
  }

  diagnostics() {
    return {
      lastPublishMs: this.lastPublishMs,
      lastEventId: this.lastEventId,
      pending: Boolean(this.pendingInput),
      coalesceMs: this.coalesceMs,
      maxIntervalMs: this.maxIntervalMs,
      durableIntervalMs: this.durableIntervalMs,
    };
  }

  private async safeError(
    stage: string,
    message: string,
    detail?: Record<string, unknown>
  ): Promise<void> {
    if (!this.recordError) return;
    await this.recordError({ stage, message, detail });
  }
}

function preferEventId(a: string, b: string): string {
  const na = Number(String(a).replace(/\D+/g, "") || NaN);
  const nb = Number(String(b).replace(/\D+/g, "") || NaN);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return nb >= na ? b : a;
  }
  return b || a;
}

function mergeTickers<T extends { symbol: string; attentionPriority: number }>(
  a: T[],
  b: T[]
): T[] {
  const map = new Map<string, T>();
  for (const t of a) map.set(t.symbol.toUpperCase(), t);
  for (const t of b) map.set(t.symbol.toUpperCase(), t);
  return [...map.values()];
}

function mergeTape<T extends { id: string; atMs: number }>(
  a: T[] | undefined,
  b: T[] | undefined
): T[] {
  const map = new Map<string, T>();
  for (const e of a ?? []) map.set(e.id, e);
  for (const e of b ?? []) map.set(e.id, e);
  return [...map.values()].sort((x, y) => y.atMs - x.atMs);
}
