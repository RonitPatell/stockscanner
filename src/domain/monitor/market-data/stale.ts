import type { NormalizedNbboQuote, NormalizedTrade } from "./types.ts";

export interface StaleCheckResult {
  stale: boolean;
  ageMs: number;
  reason?: string;
}

/**
 * Quote/trade staleness relative to wall clock (injected for tests).
 */
export function isQuoteStale(
  quote: Pick<NormalizedNbboQuote, "sipTimestamp" | "quoteQuality">,
  opts: { nowMs?: number; maxAgeMs?: number } = {}
): StaleCheckResult {
  const now = opts.nowMs ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 5_000;
  const t = Date.parse(quote.sipTimestamp);
  if (!Number.isFinite(t)) {
    return { stale: true, ageMs: Number.POSITIVE_INFINITY, reason: "bad_timestamp" };
  }
  const ageMs = Math.max(0, now - t);
  if (quote.quoteQuality === "stale") {
    return { stale: true, ageMs, reason: "quality_stale" };
  }
  if (ageMs > maxAge) {
    return { stale: true, ageMs, reason: "age_exceeded" };
  }
  return { stale: false, ageMs };
}

export function isTradeStale(
  trade: Pick<NormalizedTrade, "sipTimestamp">,
  opts: { nowMs?: number; maxAgeMs?: number } = {}
): StaleCheckResult {
  const now = opts.nowMs ?? Date.now();
  const maxAge = opts.maxAgeMs ?? 30_000;
  const t = Date.parse(trade.sipTimestamp);
  if (!Number.isFinite(t)) {
    return { stale: true, ageMs: Number.POSITIVE_INFINITY, reason: "bad_timestamp" };
  }
  const ageMs = Math.max(0, now - t);
  return ageMs > maxAge
    ? { stale: true, ageMs, reason: "age_exceeded" }
    : { stale: false, ageMs };
}
