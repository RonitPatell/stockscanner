/**
 * Server singleton for Monitor Event Tape retention.
 * Shared market tape is product data (not per-user private rows).
 * Never returns secrets; ingest is cron-gated.
 */

import { getRedis } from "../redis.ts";
import { RedisEventTapeStore } from "../../adapters/monitor/event-tape/redis-tape-store.ts";
import {
  EventTapeEngine,
  MemoryEventTapeStore,
  type EventTapeStorePort,
  type MonitorTapeItem,
  type RawTapeSignal,
  type TapeIngestResult,
} from "../../domain/monitor/event-tape/index.ts";

let engine: EventTapeEngine | null = null;

function buildStore(): EventTapeStorePort {
  const redis = getRedis();
  if (redis) {
    return new RedisEventTapeStore({
      lpush: (key, ...values) => redis.lpush(key, ...values),
      ltrim: (key, start, stop) => redis.ltrim(key, start, stop),
      lrange: (key, start, stop) => redis.lrange(key, start, stop),
      expire: (key, seconds) => redis.expire(key, seconds),
    });
  }
  return new MemoryEventTapeStore();
}

export function getEventTapeEngine(): EventTapeEngine {
  if (!engine) {
    engine = new EventTapeEngine({ store: buildStore() });
  }
  return engine;
}

/** Test-only reset. */
export function __resetEventTapeEngineForTests(): void {
  engine = null;
}

export async function listEventTape(opts?: {
  sinceMs?: number;
  limit?: number;
  symbol?: string;
}): Promise<MonitorTapeItem[]> {
  return getEventTapeEngine().list(opts);
}

export async function ingestEventTape(
  signals: RawTapeSignal[]
): Promise<TapeIngestResult> {
  return getEventTapeEngine().ingest(signals);
}
