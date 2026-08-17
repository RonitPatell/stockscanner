/**
 * Vendor-neutral server-side analytics adapter.
 * Never accepts email, phone, webhooks, or raw watchlists.
 */

import { getRedis } from "../redis.ts";

export const FUNNEL_EVENTS = [
  "landing_view",
  "landing_cta_replay",
  "landing_cta_trial",
  "landing_case_study_click",
  "demo_view",
  "pricing_view",
  "signup_started",
  "signup_completed",
  "checkout_started",
  "trial_started",
  "onboarding_step_completed",
  "activation_completed",
  "first_alert_delivered",
  "day_2_return",
  "day_5_return",
  "paid_conversion",
  "cancellation",
  "cancellation_reason",
  "company_searched",
  "company_hydration_requested",
  "company_hydration_ready",
  "portfolio_company_added",
  "thesis_created",
  "thesis_condition_created",
  "thesis_relevant_event_detected",
  "watchtower_event_opened",
  "event_marked_reviewed",
  "portfolio_brief_opened",
  "alert_created",
  "research_return_visit",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

const BANNED_PROP_KEYS = [
  "email",
  "phone",
  "phoneNumber",
  "webhook",
  "discordWebhook",
  "watchlist",
  "password",
  "passwordHash",
  "pushSubscription",
  "stripeCustomerId",
];

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

const memory = new Map<string, number>();
const reasonMemory = new Map<string, number>();

export function isFunnelEvent(value: string): value is FunnelEvent {
  return (FUNNEL_EVENTS as readonly string[]).includes(value);
}

function scrubProps(props?: TrackProps): Record<string, string | number | boolean> {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase();
    if (BANNED_PROP_KEYS.some((b) => lower === b.toLowerCase() || lower.includes("webhook"))) {
      continue;
    }
    if (v == null) continue;
    if (typeof v === "string") {
      // Reject values that look like emails, phones, or URLs with secrets
      if (/@/.test(v) || /^\+?\d{10,}$/.test(v) || /webhook/i.test(v)) continue;
      out[k] = v.slice(0, 64);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

/** Test helper — returns scrubbed props without side effects. */
export function scrubTrackProps(props?: TrackProps): Record<string, string | number | boolean> {
  return scrubProps(props);
}

/**
 * Server-side track(). Increments Redis/memory counters.
 * Optional props are scrubbed — no PII.
 */
export async function track(
  event: FunnelEvent,
  props?: TrackProps
): Promise<void> {
  const safe = scrubProps(props);
  const key = `funnel:evt:${event}`;
  memory.set(key, (memory.get(key) ?? 0) + 1);

  if (event === "cancellation_reason" && typeof safe.reason === "string") {
    const rk = `funnel:cancel_reason:${safe.reason}`;
    reasonMemory.set(rk, (reasonMemory.get(rk) ?? 0) + 1);
  }

  const redis = getRedis();
  if (redis) {
    try {
      await redis.incr(key);
      await redis.expire(key, 90 * 24 * 3600);
      if (event === "cancellation_reason" && typeof safe.reason === "string") {
        const rk = `funnel:cancel_reason:${safe.reason}`;
        await redis.incr(rk);
        await redis.expire(rk, 90 * 24 * 3600);
      }
      // Cohort bucket by UTC day for dashboard filters
      const day = new Date().toISOString().slice(0, 10);
      const dayKey = `funnel:day:${day}:${event}`;
      await redis.incr(dayKey);
      await redis.expire(dayKey, 90 * 24 * 3600);
    } catch {
      /* memory only */
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[track]", event, safe);
  }
}

export async function getFunnelEventCounts(): Promise<Record<FunnelEvent, number>> {
  const out = {} as Record<FunnelEvent, number>;
  const redis = getRedis();
  for (const event of FUNNEL_EVENTS) {
    let n = memory.get(`funnel:evt:${event}`) ?? 0;
    if (redis) {
      try {
        const v = await redis.get<number | string>(`funnel:evt:${event}`);
        if (typeof v === "number") n = v;
        else if (typeof v === "string") n = Number(v) || n;
      } catch {
        /* keep */
      }
    }
    out[event] = n;
  }
  return out;
}

export async function getCancellationReasonCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = { ...Object.fromEntries(reasonMemory) };
  // Redis scan not available on Upstash REST easily — rely on known allowlist
  const known = [
    "too_expensive",
    "not_using",
    "missing_features",
    "switched_tool",
    "other",
  ];
  const redis = getRedis();
  if (redis) {
    for (const reason of known) {
      try {
        const v = await redis.get<number | string>(`funnel:cancel_reason:${reason}`);
        if (typeof v === "number") out[reason] = v;
        else if (typeof v === "string") out[reason] = Number(v) || 0;
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export async function getFunnelDayCounts(
  day: string
): Promise<Partial<Record<FunnelEvent, number>>> {
  const out: Partial<Record<FunnelEvent, number>> = {};
  const redis = getRedis();
  if (!redis) return out;
  for (const event of FUNNEL_EVENTS) {
    try {
      const v = await redis.get<number | string>(`funnel:day:${day}:${event}`);
      if (typeof v === "number") out[event] = v;
      else if (typeof v === "string") out[event] = Number(v) || 0;
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Reject payloads that contain banned keys (for API tests). */
export function assertAnalyticsPrivacy(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const walk = (obj: unknown, path: string) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      for (const b of BANNED_PROP_KEYS) {
        if (lower === b.toLowerCase() || lower.includes("webhook")) {
          throw new Error(`Analytics privacy violation at ${path}.${k}`);
        }
      }
      if (typeof v === "string" && (/@/.test(v) || /webhook/i.test(v))) {
        throw new Error(`Analytics PII-like value at ${path}.${k}`);
      }
      if (typeof v === "object") walk(v, `${path}.${k}`);
    }
  };
  walk(body, "root");
}
