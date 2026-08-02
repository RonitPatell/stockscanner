/**
 * Market worker heartbeats — Redis-backed, never exposed with secrets.
 */

import { getRedis } from "../redis.ts";

export type WorkerHeartbeatName =
  | "realtime_supervisor"
  | "quote_stream"
  | "priority_ingest"
  | "monitor_market"
  | "scanner_warm";

export type WorkerHeartbeatPayload = {
  name: WorkerHeartbeatName;
  updatedAtMs: number;
  /** Opaque instance id (no hostnames with credentials). */
  instanceId: string;
  meta?: {
    providerConnected?: boolean;
    universeLoaded?: boolean;
    baselinesLoaded?: boolean;
    snapshotPublished?: boolean;
    session?: string;
  };
};

const KEY_PREFIX = "tt:worker:hb:v1:";
const memoryHb = new Map<string, WorkerHeartbeatPayload>();

function key(name: WorkerHeartbeatName): string {
  return `${KEY_PREFIX}${name}`;
}

export async function writeWorkerHeartbeat(
  payload: WorkerHeartbeatPayload,
  ttlSec = 90
): Promise<boolean> {
  memoryHb.set(payload.name, payload);
  const redis = getRedis();
  if (!redis) return true;
  try {
    await redis.set(key(payload.name), payload, { ex: ttlSec });
    return true;
  } catch {
    return false;
  }
}

export async function readWorkerHeartbeat(
  name: WorkerHeartbeatName
): Promise<WorkerHeartbeatPayload | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const row = await redis.get<WorkerHeartbeatPayload>(key(name));
      if (row && typeof row.updatedAtMs === "number") return row;
    } catch {
      /* memory */
    }
  }
  return memoryHb.get(name) ?? null;
}

export function heartbeatAgeMs(
  hb: WorkerHeartbeatPayload | null,
  nowMs = Date.now()
): number | null {
  if (!hb) return null;
  return Math.max(0, nowMs - hb.updatedAtMs);
}

/** Fresh when heartbeat younger than maxAgeMs. */
export function isHeartbeatFresh(
  hb: WorkerHeartbeatPayload | null,
  maxAgeMs = 90_000,
  nowMs = Date.now()
): boolean {
  const age = heartbeatAgeMs(hb, nowMs);
  if (age == null) return false;
  return age <= maxAgeMs;
}

export function __resetWorkerHeartbeatsForTests(): void {
  memoryHb.clear();
}
