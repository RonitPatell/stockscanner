/**
 * Technical error session breadcrumbs for Monitor beta.
 * Never store private financial notes, watchlists, webhooks, or PII bodies.
 */

import { getRedis } from "@/lib/redis";
import { scrubFeedbackAnalyticsProps } from "@/lib/trader-feedback/privacy";

const KEY = "tt:monitor:rollout:v1:error_sessions";
const MAX = 100;

export interface MonitorErrorSessionEvent {
  id: string;
  atMs: number;
  userIdHash: string;
  message: string;
  name: string | null;
  stackTop: string | null;
  path: string | null;
  buildId: string | null;
  breadcrumbs: string[];
}

const g = globalThis as typeof globalThis & {
  __ttMonitorErrorSessions?: MonitorErrorSessionEvent[];
};

function mem(): MonitorErrorSessionEvent[] {
  if (!g.__ttMonitorErrorSessions) g.__ttMonitorErrorSessions = [];
  return g.__ttMonitorErrorSessions;
}

const BANNED =
  /private\s*note|watchlist|webhook|password|api[_-]?key|account\s*number|ssn|routing/i;

function scrubText(raw: unknown, max = 240): string {
  const s = String(raw ?? "")
    .replace(BANNED, "[redacted]")
    .slice(0, max);
  return s;
}

export async function recordMonitorErrorSession(input: {
  userId: string;
  message: unknown;
  name?: unknown;
  stack?: unknown;
  path?: unknown;
  buildId?: unknown;
  breadcrumbs?: unknown;
}): Promise<MonitorErrorSessionEvent> {
  const crumbs = Array.isArray(input.breadcrumbs)
    ? input.breadcrumbs
        .map((c) => scrubText(c, 120))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const stackTop = scrubText(
    String(input.stack ?? "")
      .split("\n")
      .slice(0, 3)
      .join(" | "),
    400
  );

  // Drop any accidental note-like props if a future client sends an object.
  scrubFeedbackAnalyticsProps({
    message: String(input.message ?? ""),
  });

  const row: MonitorErrorSessionEvent = {
    id: `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    atMs: Date.now(),
    userIdHash: hashUser(input.userId),
    message: scrubText(input.message, 300),
    name: input.name != null ? scrubText(input.name, 80) : null,
    stackTop: stackTop || null,
    path: input.path != null ? scrubText(input.path, 160) : null,
    buildId: input.buildId != null ? scrubText(input.buildId, 80) : null,
    breadcrumbs: crumbs,
  };

  const list = mem();
  list.push(row);
  if (list.length > MAX) list.splice(0, list.length - MAX);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(KEY, JSON.stringify(row));
      await redis.ltrim(KEY, 0, MAX - 1);
      await redis.expire(KEY, 14 * 24 * 3600);
    } catch {
      /* memory */
    }
  }
  return row;
}

export async function listMonitorErrorSessions(
  limit = 40
): Promise<MonitorErrorSessionEvent[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(KEY, 0, Math.max(0, limit - 1));
      const out: MonitorErrorSessionEvent[] = [];
      for (const raw of rows) {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        try {
          out.push(JSON.parse(s) as MonitorErrorSessionEvent);
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

function hashUser(userId: string): string {
  // Short non-reversible id for correlation without exposing user id in admin lists.
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return `u${h.toString(16).padStart(8, "0")}`;
}
