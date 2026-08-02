import type { MonitorPublicSnapshot } from "./types.ts";

/**
 * Parse monotonic event id. Accepts numeric strings or "evt:123" forms.
 * Returns null when unparseable.
 */
export function parseEventIdOrder(eventId: string): number | null {
  if (!eventId) return null;
  const direct = Number(eventId);
  if (Number.isFinite(direct)) return direct;
  const m = eventId.match(/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export type PublishFreshnessDecision =
  | { allow: true; reason: "first" | "newer" | "recovery" | "same_or_refresh" }
  | { allow: false; reason: "stale_market_data" };

/**
 * Refuse to publish a snapshot with older market data than the active one,
 * unless explicitly marked recovery.
 */
export function decidePublishFreshness(
  candidate: MonitorPublicSnapshot,
  active: MonitorPublicSnapshot | null
): PublishFreshnessDecision {
  if (!active) return { allow: true, reason: "first" };
  if (candidate.recovery) return { allow: true, reason: "recovery" };

  const c = parseEventIdOrder(candidate.lastEventId);
  const a = parseEventIdOrder(active.lastEventId);
  if (c == null || a == null) {
    // Fall back to generatedAtMs when ids are opaque.
    if (candidate.generatedAtMs >= active.generatedAtMs) {
      return { allow: true, reason: "same_or_refresh" };
    }
    return { allow: false, reason: "stale_market_data" };
  }
  if (c < a) return { allow: false, reason: "stale_market_data" };
  if (c > a) return { allow: true, reason: "newer" };
  return { allow: true, reason: "same_or_refresh" };
}
