/**
 * Append-only Monitor Ops quality observations.
 * Never used to silently rewrite historical market frames.
 */

import { getRedis } from "@/lib/redis";
import type { MonitorOpsQualityEvent } from "@/domain/monitor/ops";

const QUALITY_KEY = "tt:monitor:ops:v1:quality";
const MAX = 500;

const g = globalThis as typeof globalThis & {
  __ttMonitorOpsQuality?: MonitorOpsQualityEvent[];
};

function mem(): MonitorOpsQualityEvent[] {
  if (!g.__ttMonitorOpsQuality) g.__ttMonitorOpsQuality = [];
  return g.__ttMonitorOpsQuality;
}

export async function recordMonitorOpsQuality(
  event: Omit<MonitorOpsQualityEvent, "id"> & { id?: string }
): Promise<MonitorOpsQualityEvent> {
  const row: MonitorOpsQualityEvent = {
    id: event.id ?? `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind: event.kind,
    atMs: event.atMs,
    symbol: event.symbol ?? null,
    note: String(event.note ?? "").slice(0, 400),
    meta: event.meta,
  };
  const list = mem();
  list.push(row);
  if (list.length > MAX) list.splice(0, list.length - MAX);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(QUALITY_KEY, JSON.stringify(row));
      await redis.ltrim(QUALITY_KEY, 0, MAX - 1);
      await redis.expire(QUALITY_KEY, 14 * 24 * 3600);
    } catch {
      /* memory only */
    }
  }
  return row;
}

export async function listMonitorOpsQuality(
  limit = 200
): Promise<MonitorOpsQualityEvent[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(QUALITY_KEY, 0, Math.max(0, limit - 1));
      const parsed: MonitorOpsQualityEvent[] = [];
      for (const raw of rows) {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        try {
          const obj = JSON.parse(s) as MonitorOpsQualityEvent;
          if (obj && typeof obj.kind === "string") parsed.push(obj);
        } catch {
          /* skip */
        }
      }
      if (parsed.length) return parsed;
    } catch {
      /* fall through */
    }
  }
  return mem().slice(-limit).reverse();
}

export function __resetMonitorOpsQualityForTests(): void {
  g.__ttMonitorOpsQuality = [];
}
