/**
 * Trade-condition eligibility for last/price statistics.
 * Conservative: exclude known odd-lot / average-price / derivatively priced
 * when condition codes are present. Unknown empty conditions → eligible
 * (common for Finnhub-normalized trades).
 */

/** Conditions that disqualify a print from last-price / some volume stats. */
const EXCLUDE = new Set([
  "T", // average price trade (CTA)
  "W", // average price trade
  "4", // derivatively priced
  "5", // market center official close
  "7", // qualified contingent
  "8", // average price
  "9", // prior reference price
  "G", // bunched sold
  "H", // price variation
  "I", // odd lot (some tapes)
  "K", // rule 127 / 155
  "L", // sold last
  "N", // next day
  "P", // prior reference
  "R", // seller
  "U", // sold out of sequence variants
  "V", // stock option
  "X", // cross trade
  "Z", // sold (out of sequence)
  "ODD_LOT",
  "AVERAGE",
  "DERIVATIVELY_PRICED",
  "OUT_OF_SEQUENCE",
]);

/** Conditions that always update last when present alone or with others. */
const FORCE_INCLUDE = new Set(["@", "F", "6", "Q", "O", "C", " ", ""]);

export interface EligibilityResult {
  eligibleForLast: boolean;
  eligibleForVolume: boolean;
  note?: string;
}

export function classifyTradeConditions(
  conditions: string[] | undefined | null
): EligibilityResult {
  if (!conditions || conditions.length === 0) {
    return { eligibleForLast: true, eligibleForVolume: true };
  }
  const norm = conditions.map((c) => String(c).trim().toUpperCase());
  let excludeLast = false;
  let excludeVol = false;
  for (const c of norm) {
    if (FORCE_INCLUDE.has(c)) continue;
    if (c === "I" || c === "ODD_LOT") {
      excludeLast = true;
      // still count volume cautiously
      continue;
    }
    if (EXCLUDE.has(c)) {
      excludeLast = true;
      if (c === "T" || c === "W" || c === "8" || c === "AVERAGE") {
        excludeVol = true;
      }
    }
  }
  return {
    eligibleForLast: !excludeLast,
    eligibleForVolume: !excludeVol,
    note: excludeLast ? "condition_excluded" : undefined,
  };
}

/**
 * Infer buy/sell only when quote mid is fresh and trade clearly at/through touch.
 * Otherwise unavailable — never invent imbalance.
 */
export type TradeSide = "buy" | "sell" | "unknown";

export function inferTradeSide(input: {
  price: number;
  bid: number | null;
  ask: number | null;
  quoteAgeMs: number | null;
  maxQuoteAgeMs?: number;
}): { side: TradeSide; reliable: boolean; note?: string } {
  const maxAge = input.maxQuoteAgeMs ?? 2_000;
  if (
    input.bid == null ||
    input.ask == null ||
    input.bid <= 0 ||
    input.ask <= 0 ||
    input.ask < input.bid
  ) {
    return { side: "unknown", reliable: false, note: "no_reliable_quote" };
  }
  if (input.quoteAgeMs == null || input.quoteAgeMs > maxAge) {
    return { side: "unknown", reliable: false, note: "quote_stale_for_side" };
  }
  if (input.price >= input.ask) {
    return { side: "buy", reliable: true };
  }
  if (input.price <= input.bid) {
    return { side: "sell", reliable: true };
  }
  return { side: "unknown", reliable: false, note: "inside_spread" };
}
