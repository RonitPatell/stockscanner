/**
 * Corporate-action / symbol hygiene for analogue matching.
 * Descriptive exclusions only — never invent adjusted prices without factors.
 */

export interface CorporateActionFactor {
  symbol: string;
  /** Effective date ISO (date of split/change) */
  effectiveAt: string;
  /** Multiply historical prices before effectiveAt by this to get as-of-today terms */
  splitFactor: number;
  /** New symbol if ticker changed; null if delisted without successor */
  successorSymbol?: string | null;
  delisted?: boolean;
  note?: string;
}

export interface AdjustedPriceResult {
  price: number | null;
  adjusted: boolean;
  excluded: boolean;
  reason: string | null;
}

/**
 * Adjust a historical price forward to a reference date using known factors.
 * If factor missing and ratio looks like a clean split vs reference, mark suspect/exclude.
 */
export function adjustPriceForSplits(opts: {
  symbol: string;
  historicalPrice: number | null | undefined;
  historicalAt: string | Date;
  referenceAt?: string | Date;
  factors: CorporateActionFactor[];
  /** Optional live/reference price to detect unlisted splits */
  referencePrice?: number | null;
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

  const histMs = new Date(opts.historicalAt).getTime();
  const refMs = opts.referenceAt
    ? new Date(opts.referenceAt).getTime()
    : Date.now();
  if (!Number.isFinite(histMs)) {
    return {
      price: null,
      adjusted: false,
      excluded: true,
      reason: "invalid_historical_time",
    };
  }

  let factor = 1;
  let adjusted = false;
  const sym = opts.symbol.toUpperCase();
  for (const f of opts.factors) {
    if (f.symbol.toUpperCase() !== sym) continue;
    const eff = Date.parse(f.effectiveAt);
    if (!Number.isFinite(eff)) continue;
    // Factor applies to prices before the effective date when bringing forward
    if (histMs < eff && eff <= refMs) {
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

  // Unlisted split heuristic vs reference price
  if (
    opts.referencePrice != null &&
    opts.referencePrice > 0 &&
    !adjusted
  ) {
    const ratio = opts.referencePrice / px;
    const splitFactors = [2, 3, 4, 5, 10, 0.5, 1 / 3, 0.25, 0.2, 0.1];
    for (const sf of splitFactors) {
      if (Math.abs(ratio - sf) / sf < 0.03) {
        return {
          price: null,
          adjusted: false,
          excluded: true,
          reason: "split_adjust_suspect_unlisted",
        };
      }
    }
  }

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

export function resolveSymbolAsOf(opts: {
  symbol: string;
  asOf: string | Date;
  factors: CorporateActionFactor[];
}): {
  symbol: string;
  delisted: boolean;
  changed: boolean;
  note: string | null;
} {
  const asOfMs = new Date(opts.asOf).getTime();
  let symbol = opts.symbol.toUpperCase();
  let delisted = false;
  let changed = false;
  let note: string | null = null;

  const relevant = opts.factors
    .filter((f) => f.symbol.toUpperCase() === symbol || f.successorSymbol?.toUpperCase() === symbol)
    .sort(
      (a, b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt)
    );

  for (const f of relevant) {
    const eff = Date.parse(f.effectiveAt);
    if (!Number.isFinite(eff) || eff > asOfMs) continue;
    if (f.delisted && !f.successorSymbol) {
      delisted = true;
      note = f.note ?? "delisted";
    }
    if (f.successorSymbol && f.symbol.toUpperCase() === symbol) {
      symbol = f.successorSymbol.toUpperCase();
      changed = true;
      note = f.note ?? `symbol_change_to_${symbol}`;
    }
  }

  return { symbol, delisted, changed, note };
}

/** Detect corrupted candle path (zeros, inverted high/low, NaN). */
export function isCorruptCandlePath(
  bars: Array<{ o: number; h: number; l: number; c: number }>
): boolean {
  if (!bars.length) return true;
  for (const b of bars) {
    if (
      ![b.o, b.h, b.l, b.c].every((x) => Number.isFinite(x) && x > 0)
    ) {
      return true;
    }
    if (b.h < b.l || b.c > b.h * 1.001 || b.c < b.l * 0.999) {
      // allow tiny float noise on close vs range
      if (b.h < b.l) return true;
      if (b.c > b.h * 1.05 || b.c < b.l * 0.95) return true;
    }
  }
  return false;
}
