/**
 * Monitor beta feedback capture — scrubbed, rate-limited at route layer.
 */

import { getRedis } from "@/lib/redis";
import { scrubFeedbackAnalyticsProps } from "@/lib/trader-feedback/privacy";

const KEY = "tt:monitor:rollout:v1:feedback";
const MAX = 200;

export interface MonitorBetaFeedback {
  id: string;
  atMs: number;
  userId: string;
  category: "bug" | "ux" | "data_quality" | "other";
  message: string;
  path: string | null;
  buildId: string | null;
  stage: string | null;
}

const g = globalThis as typeof globalThis & {
  __ttMonitorBetaFeedback?: MonitorBetaFeedback[];
};

function mem(): MonitorBetaFeedback[] {
  if (!g.__ttMonitorBetaFeedback) g.__ttMonitorBetaFeedback = [];
  return g.__ttMonitorBetaFeedback;
}

export async function recordMonitorBetaFeedback(input: {
  userId: string;
  category?: unknown;
  message: unknown;
  path?: unknown;
  buildId?: unknown;
  stage?: unknown;
}): Promise<MonitorBetaFeedback> {
  const catRaw = String(input.category ?? "other").toLowerCase();
  const category =
    catRaw === "bug" ||
    catRaw === "ux" ||
    catRaw === "data_quality" ||
    catRaw === "other"
      ? catRaw
      : "other";

  const scrubbed = scrubFeedbackAnalyticsProps({
    message: String(input.message ?? "").slice(0, 2_000),
  });

  const row: MonitorBetaFeedback = {
    id: `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    atMs: Date.now(),
    userId: input.userId,
    category,
    message: String(scrubbed.message ?? "").slice(0, 2_000),
    path: input.path != null ? String(input.path).slice(0, 160) : null,
    buildId: input.buildId != null ? String(input.buildId).slice(0, 80) : null,
    stage: input.stage != null ? String(input.stage).slice(0, 64) : null,
  };

  const list = mem();
  list.push(row);
  if (list.length > MAX) list.splice(0, list.length - MAX);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(KEY, JSON.stringify(row));
      await redis.ltrim(KEY, 0, MAX - 1);
      await redis.expire(KEY, 30 * 24 * 3600);
    } catch {
      /* memory */
    }
  }
  return row;
}

export async function listMonitorBetaFeedback(
  limit = 50
): Promise<MonitorBetaFeedback[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(KEY, 0, Math.max(0, limit - 1));
      const out: MonitorBetaFeedback[] = [];
      for (const raw of rows) {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        try {
          out.push(JSON.parse(s) as MonitorBetaFeedback);
        } catch {
          /* skip */
        }
      }
      if (out.length) return out;
    } catch {
      /* fall through */
    }
  }
  return mem().slice(-limit).reverse();
}
