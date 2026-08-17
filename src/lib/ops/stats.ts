/**
 * Lightweight ops counters + last-success stamps.
 * Redis preferred; process memory fallback (lossy across isolates).
 * Never stores secrets or PII.
 */

import { getRedis } from "../redis.ts";

const REDIS_PREFIX = "tt:ops:v1:";
const TTL_SEC = 14 * 24 * 60 * 60;

type OpsStamp = {
  at: number;
  meta?: Record<string, string | number | boolean | null>;
};

const stamps = new Map<string, OpsStamp>();
const counters = new Map<string, number>();

function stampKey(name: string): string {
  return `${REDIS_PREFIX}stamp:${name}`;
}

function counterKey(name: string): string {
  return `${REDIS_PREFIX}ctr:${name}`;
}

export type OpsStampName =
  | "sec_ingest_ok"
  | "company_event_ok"
  | "metrics_normalize_ok"
  | "capital_risk_ok"
  | "thesis_eval_ok"
  | "stripe_webhook_ok"
  | "alert_delivery_ok"
  | "cron_wire_ok"
  | "cron_ingest_ok"
  | "cron_13f_ok"
  | "cron_filings_ok"
  | "cron_metrics_ok"
  | "cron_discover_ok"
  | "cron_thesis_ok"
  | "cron_dilution_ok"
  | "cron_briefs_ok"
  | "cron_alert_backbone_ok"
  | "cron_hydrate_ok";

export type OpsCounterName =
  | "sec_ingest_fail"
  | "company_event_fail"
  | "metrics_normalize_fail"
  | "capital_risk_fail"
  | "thesis_eval_fail"
  | "stripe_webhook_fail"
  | "alert_delivery_fail"
  | "duplicate_suppressed"
  | "cron_fail";

export async function recordOpsStamp(
  name: OpsStampName,
  meta?: OpsStamp["meta"]
): Promise<void> {
  const value: OpsStamp = { at: Date.now(), meta };
  stamps.set(name, value);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(stampKey(name), value, { ex: TTL_SEC });
  } catch {
    /* memory ok */
  }
}

export async function incrOpsCounter(
  name: OpsCounterName,
  by = 1
): Promise<void> {
  const n = Math.max(1, Math.floor(by));
  counters.set(name, (counters.get(name) ?? 0) + n);
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = counterKey(name);
    const next = await redis.incrby(key, n);
    if (next === n) {
      await redis.expire(key, TTL_SEC);
    }
  } catch {
    /* memory ok */
  }
}

export async function getOpsStamp(
  name: OpsStampName
): Promise<OpsStamp | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get<OpsStamp>(stampKey(name));
      if (hit && typeof hit === "object" && typeof hit.at === "number") {
        stamps.set(name, hit);
        return hit;
      }
    } catch {
      /* memory */
    }
  }
  return stamps.get(name) ?? null;
}

export async function getOpsCounter(name: OpsCounterName): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<number | string>(counterKey(name));
      if (raw != null) {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(n)) {
          counters.set(name, n);
          return n;
        }
      }
    } catch {
      /* memory */
    }
  }
  return counters.get(name) ?? 0;
}

export function __resetOpsStatsForTests(): void {
  stamps.clear();
  counters.clear();
}
