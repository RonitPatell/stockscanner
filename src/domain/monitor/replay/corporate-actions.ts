/**
 * Corporate-action adjustments for replay.
 * Only factors known at (or before) the cursor time may apply — no look-ahead.
 */

import type { CorporateActionFactor } from "./types.ts";

export interface AdjustedPriceResult {
  price: number | null;
  adjusted: boolean;
  excluded: boolean;
  reason: string | null;
}

/**
 * Adjust a historical price using only factors with effectiveAt <= asOfMs
 * and histMs < effectiveAt. Factors after asOfMs are ignored (anti look-ahead).
 */
export function adjustPriceAsOf(opts: {
  symbol: string;
  historicalPrice: number | null | undefined;
  historicalAtMs: number;
  /** Replay cursor / frame time — future factors must not apply */
  asOfMs: number;
  factors: CorporateActionFactor[];
}): AdjustedPriceResult {
  const px = opts.historicalPrice;
  if (px == null || !(px > 0)) {
    return {
      price: null,
      adjusted: false,
      excluded: true,
      reason: "missing_price",
    };
  }
  if (!Number.isFinite(opts.historicalAtMs) || !Number.isFinite(opts.asOfMs)) {
    return {
      price: null,
      adjusted: false,
      excluded: true,
      reason: "invalid_time",
    };
  }

  let factor = 1;
  let adjusted = false;
  const sym = opts.symbol.toUpperCase();

  for (const f of opts.factors) {
    if (f.symbol.toUpperCase() !== sym) continue;
    const eff = Date.parse(f.effectiveAt);
    if (!Number.isFinite(eff)) continue;
    // Look-ahead guard: factor must be known by asOfMs
    if (eff > opts.asOfMs) continue;
    if (opts.historicalAtMs < eff && eff <= opts.asOfMs) {
      if (!(f.splitFactor > 0) || !Number.isFinite(f.splitFactor)) {
        return {
          price: null,
          adjusted: false,
          excluded: true,
          reason: "invalid_split_factor",
        };
      }
      factor *= f.splitFactor;
      adjusted = true;
    }
  }

  const out = px * factor;
  if (!Number.isFinite(out) || !(out > 0)) {
    return {
      price: null,
      adjusted: false,
      excluded: true,
      reason: "corrupt_adjusted_price",
    };
  }
  return { price: out, adjusted, excluded: false, reason: null };
}

/** Drop any factor that would not have been known at asOfMs. */
export function factorsKnownAsOf(
  factors: CorporateActionFactor[],
  asOfMs: number
): CorporateActionFactor[] {
  return factors.filter((f) => {
    const eff = Date.parse(f.effectiveAt);
    return Number.isFinite(eff) && eff <= asOfMs;
  });
}
