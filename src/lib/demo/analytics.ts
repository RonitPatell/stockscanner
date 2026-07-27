import { getRedis } from "../redis.ts";
import {
  DEMO_ANALYTICS_EVENTS,
  type DemoAnalyticsEvent,
} from "./types.ts";

const memory = new Map<string, number>();

export function isDemoAnalyticsEvent(value: string): value is DemoAnalyticsEvent {
  return (DEMO_ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/** Aggregate counters only — no user ids, emails, or payloads. */
export async function trackDemoEvent(event: DemoAnalyticsEvent): Promise<void> {
  const key = `demo:evt:${event}`;
  memory.set(key, (memory.get(key) ?? 0) + 1);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.incr(key);
      await redis.expire(key, 30 * 24 * 3600);
    } catch {
      /* memory only */
    }
  }
}

export async function getDemoEventCounts(): Promise<Record<DemoAnalyticsEvent, number>> {
  const out = {} as Record<DemoAnalyticsEvent, number>;
  const redis = getRedis();
  for (const event of DEMO_ANALYTICS_EVENTS) {
    let n = memory.get(`demo:evt:${event}`) ?? 0;
    if (redis) {
      try {
        const v = await redis.get<number>(`demo:evt:${event}`);
        if (typeof v === "number") n = v;
        else if (typeof v === "string") n = Number(v) || n;
      } catch {
        /* keep memory */
      }
    }
    out[event] = n;
  }
  return out;
}
