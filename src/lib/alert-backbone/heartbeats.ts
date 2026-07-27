import { getRedis } from "../redis.ts";
import type { SourceHeartbeat } from "./types.ts";

const HEARTBEAT_PREFIX = "alertbb:hb:";
const GAP_COUNT_KEY = "alertbb:gaps:hour";
const memoryHb = new Map<string, SourceHeartbeat>();
const memoryGapHour = { hour: "", count: 0 };

function hourBucket(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 13);
}

export async function recordSourceHeartbeat(input: {
  sourceId: string;
  provider: string;
  cursor?: string | null;
  connectionMode?: SourceHeartbeat["connectionMode"];
  expectedIntervalMs?: number;
}): Promise<SourceHeartbeat> {
  const now = Date.now();
  const prev = await getSourceHeartbeat(input.sourceId);
  const expected = input.expectedIntervalMs ?? 60_000;
  let gapDetected = false;
  let consecutiveMisses = prev?.consecutiveMisses ?? 0;
  let lastGapAt = prev?.lastGapAt ?? null;

  if (prev?.lastBeatAt) {
    const gap = now - new Date(prev.lastBeatAt).getTime();
    if (gap > expected * 2.5) {
      gapDetected = true;
      consecutiveMisses += 1;
      lastGapAt = new Date(now).toISOString();
      await incrementDataGapCount();
    } else {
      consecutiveMisses = 0;
    }
  }

  const hb: SourceHeartbeat = {
    sourceId: input.sourceId,
    provider: input.provider,
    lastBeatAt: new Date(now).toISOString(),
    lastCursor: input.cursor ?? prev?.lastCursor ?? null,
    consecutiveMisses,
    gapDetected,
    lastGapAt,
    connectionMode: input.connectionMode ?? prev?.connectionMode ?? "poll",
  };

  memoryHb.set(input.sourceId, hb);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(HEARTBEAT_PREFIX + input.sourceId, hb, {
        ex: 7 * 24 * 3600,
      });
    } catch {
      /* ignore */
    }
  }
  return hb;
}

export async function getSourceHeartbeat(
  sourceId: string
): Promise<SourceHeartbeat | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<SourceHeartbeat>(HEARTBEAT_PREFIX + sourceId);
      if (raw && typeof raw === "object") return raw;
    } catch {
      /* memory */
    }
  }
  return memoryHb.get(sourceId) ?? null;
}

export async function listSourceHeartbeats(
  sourceIds: string[]
): Promise<SourceHeartbeat[]> {
  const out: SourceHeartbeat[] = [];
  for (const id of sourceIds) {
    const hb = await getSourceHeartbeat(id);
    if (hb) out.push(hb);
  }
  return out;
}

async function incrementDataGapCount(now = Date.now()): Promise<number> {
  const hour = hourBucket(now);
  const redis = getRedis();
  if (redis) {
    try {
      const key = `${GAP_COUNT_KEY}:${hour}`;
      const n = await redis.incr(key);
      await redis.expire(key, 48 * 3600);
      return n;
    } catch {
      /* memory */
    }
  }
  if (memoryGapHour.hour !== hour) {
    memoryGapHour.hour = hour;
    memoryGapHour.count = 0;
  }
  memoryGapHour.count += 1;
  return memoryGapHour.count;
}

export async function getDataGapsThisHour(now = Date.now()): Promise<number> {
  const hour = hourBucket(now);
  const redis = getRedis();
  if (redis) {
    try {
      const n = await redis.get<number>(`${GAP_COUNT_KEY}:${hour}`);
      return typeof n === "number" ? n : 0;
    } catch {
      /* memory */
    }
  }
  return memoryGapHour.hour === hour ? memoryGapHour.count : 0;
}

export function __resetHeartbeatsForTests(): void {
  memoryHb.clear();
  memoryGapHour.hour = "";
  memoryGapHour.count = 0;
}
