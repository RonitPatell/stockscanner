/**
 * Operational readiness for market / Monitor workers.
 * Public exposure must use `toPublicMarketReadiness` only.
 */

import { getRedis } from "../redis.ts";
import { prisma } from "../prisma.ts";
import { getActiveMonitorPublicSnapshot } from "../monitor/snapshot/service.ts";
import { LIVE_STREAM_TS_KEY } from "../quote-cache-service.ts";
import { getSessionContext } from "../../domain/monitor/market-state/session.ts";
import {
  isHeartbeatFresh,
  readWorkerHeartbeat,
  type WorkerHeartbeatName,
} from "./heartbeat.ts";
import { peekWorkerLease } from "./lease.ts";
import type {
  CheckState,
  MarketReadinessInternal,
} from "./market-readiness-types.ts";

export type {
  CheckState,
  MarketReadinessInternal,
  PublicMarketReadiness,
} from "./market-readiness-types.ts";
export { toPublicMarketReadiness } from "./public-readiness.ts";

const SNAPSHOT_FRESH_MS = 5 * 60_000;
const SNAPSHOT_STALE_MS = 20 * 60_000;
const QUOTE_FRESH_MS = 30_000;
const HB_FRESH_MS = 90_000;

function worst(
  ...states: CheckState[]
): CheckState {
  if (states.includes("down")) return "down";
  if (states.includes("degraded")) return "degraded";
  if (states.includes("unknown")) return "unknown";
  return "ok";
}

async function probeRedis(): Promise<CheckState> {
  const redis = getRedis();
  if (!redis) return "down";
  try {
    const probeKey = "tt:worker:readiness:ping";
    await redis.set(probeKey, String(Date.now()), { ex: 30 });
    const v = await redis.get<string>(probeKey);
    return v != null ? "ok" : "degraded";
  } catch {
    return "down";
  }
}

async function probeDatabase(): Promise<CheckState> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "down";
  }
}

async function probeEventStreamWritable(): Promise<CheckState> {
  const redis = getRedis();
  if (!redis) return "down";
  try {
    const k = "tt:monitor:delivery:v1:metrics";
    // Presence of metrics key OR ability to write a probe proves stream path.
    const probe = `tt:worker:stream-probe:${Date.now()}`;
    await redis.set(probe, "1", { ex: 15 });
    await redis.del(probe);
    const metrics = await redis.get(k);
    return metrics != null ? "ok" : "degraded";
  } catch {
    return "down";
  }
}

async function quoteStreamAgeMs(): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string | number>(LIVE_STREAM_TS_KEY);
    const ts = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return Math.max(0, Date.now() - ts);
  } catch {
    return null;
  }
}

export async function collectMarketReadiness(
  nowMs = Date.now()
): Promise<MarketReadinessInternal> {
  const session = getSessionContext(nowMs).segment;
  const [
    redisReachable,
    databaseReachable,
    eventStreamWritable,
    active,
    quoteAge,
    monitorHb,
    quoteHb,
    supervisorHb,
    monitorLease,
  ] = await Promise.all([
    probeRedis(),
    probeDatabase(),
    probeEventStreamWritable(),
    getActiveMonitorPublicSnapshot().catch(() => null),
    quoteStreamAgeMs(),
    readWorkerHeartbeat("monitor_market"),
    readWorkerHeartbeat("quote_stream"),
    readWorkerHeartbeat("realtime_supervisor"),
    peekWorkerLease("monitor_market"),
  ]);

  const snapshotAgeMs = active
    ? Math.max(0, nowMs - active.generatedAtMs)
    : null;

  let activeSnapshotPublished: CheckState = "down";
  if (active) {
    if (snapshotAgeMs != null && snapshotAgeMs <= SNAPSHOT_FRESH_MS) {
      activeSnapshotPublished = "ok";
    } else if (snapshotAgeMs != null && snapshotAgeMs <= SNAPSHOT_STALE_MS) {
      activeSnapshotPublished = "degraded";
    } else {
      activeSnapshotPublished = "degraded";
    }
    if (active.dataQuality === "degraded" || active.dataQuality === "low") {
      activeSnapshotPublished = worst(activeSnapshotPublished, "degraded");
    }
    if (active.dataQuality === "unavailable") {
      activeSnapshotPublished = "down";
    }
  }

  const providerConnected: CheckState =
    quoteAge != null && quoteAge <= QUOTE_FRESH_MS
      ? "ok"
      : quoteAge != null && quoteAge <= QUOTE_FRESH_MS * 4
        ? "degraded"
        : isHeartbeatFresh(quoteHb, HB_FRESH_MS, nowMs)
          ? "degraded"
          : session === "closed"
            ? "degraded"
            : "down";

  const meta = monitorHb?.meta;
  const symbolUniverseLoaded: CheckState = meta?.universeLoaded
    ? "ok"
    : isHeartbeatFresh(monitorHb, HB_FRESH_MS, nowMs)
      ? "degraded"
      : "unknown";
  const previousSessionBaselinesLoaded: CheckState = meta?.baselinesLoaded
    ? "ok"
    : isHeartbeatFresh(monitorHb, HB_FRESH_MS, nowMs)
      ? "degraded"
      : "unknown";

  const workerHeartbeat: CheckState =
    isHeartbeatFresh(monitorHb, HB_FRESH_MS, nowMs) ||
    isHeartbeatFresh(supervisorHb, HB_FRESH_MS, nowMs) ||
    monitorLease.held
      ? "ok"
      : session === "closed"
        ? "degraded"
        : "down";

  const checks = {
    providerConnected,
    symbolUniverseLoaded,
    previousSessionBaselinesLoaded,
    activeSnapshotPublished,
    redisReachable,
    databaseReachable,
    eventStreamWritable,
    workerHeartbeat,
  };

  const anyDown = Object.values(checks).some((c) => c === "down");
  const anyDegraded = Object.values(checks).some((c) => c === "degraded");
  const criticalDown =
    redisReachable === "down" ||
    activeSnapshotPublished === "down" ||
    (session !== "closed" && workerHeartbeat === "down");

  let status: MarketReadinessInternal["status"] = "ready";
  if (criticalDown || anyDown) status = "not_ready";
  else if (anyDegraded) status = "degraded";

  return {
    ready: status === "ready",
    status,
    session,
    checkedAtMs: nowMs,
    checks,
    detail: {
      snapshotAgeMs,
      quoteStreamAgeMs: quoteAge,
      monitorWorkerAgeMs: monitorHb
        ? Math.max(0, nowMs - monitorHb.updatedAtMs)
        : null,
      snapshotId: active?.snapshotId ?? null,
      dataQuality: active?.dataQuality ?? null,
    },
  };
}

/** Whether Monitor UI should label data degraded due to worker health. */
export async function workersUnhealthyForMonitor(
  nowMs = Date.now()
): Promise<boolean> {
  const names: WorkerHeartbeatName[] = [
    "monitor_market",
    "quote_stream",
    "realtime_supervisor",
  ];
  const hbs = await Promise.all(names.map((n) => readWorkerHeartbeat(n)));
  const anyFresh = hbs.some((h) => isHeartbeatFresh(h, HB_FRESH_MS, nowMs));
  if (anyFresh) return false;
  const session = getSessionContext(nowMs).segment;
  // Overnight closed: missing heartbeat is degraded, not an outage page.
  return session !== "closed";
}
