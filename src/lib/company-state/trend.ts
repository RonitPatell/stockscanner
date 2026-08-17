/**
 * Deterministic trend rules for Company State dimensions.
 */

import type { StateTrend } from "./types.ts";

const EPS = 1e-9;

export type TrendInput = {
  /** Latest comparable percent change (e.g. YoY revenue +12 → 12) */
  percentChange: number | null;
  /** For margins in percentage points */
  bpsChange?: number | null;
  /** When true, lower values are "improving" (e.g. debt down, share count stable/down) */
  lowerIsBetter?: boolean;
  /** Minimum |change| to call improving/deteriorating (percent) */
  thresholdPct?: number;
  /** Minimum |bps| for margin trends */
  thresholdBps?: number;
};

/**
 * Map numeric change to Improving / Stable / Deteriorating / Unknown.
 * Mixed is reserved for multi-metric dimensions (caller composes).
 */
export function trendFromChange(input: TrendInput): StateTrend {
  const threshold = input.thresholdPct ?? 2;
  const bpsThreshold = input.thresholdBps ?? 50;

  if (input.bpsChange != null && Number.isFinite(input.bpsChange)) {
    const bps = input.bpsChange;
    if (Math.abs(bps) < bpsThreshold) return "stable";
    const improving = input.lowerIsBetter ? bps < 0 : bps > 0;
    return improving ? "improving" : "deteriorating";
  }

  if (input.percentChange == null || !Number.isFinite(input.percentChange)) {
    return "unknown";
  }

  const pct = input.percentChange;
  if (Math.abs(pct) < threshold) return "stable";
  const improving = input.lowerIsBetter ? pct < 0 : pct > 0;
  if (Math.abs(pct) >= threshold) {
    return improving ? "improving" : "deteriorating";
  }
  return "stable";
}

/** Combine two trends — mixed when they disagree materially. */
export function combineTrends(a: StateTrend, b: StateTrend): StateTrend {
  if (a === "unknown" && b === "unknown") return "unknown";
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  if (a === b) return a;
  if (a === "stable" || b === "stable") return "mixed";
  return "mixed";
}

export function formatSignedPercent(v: number | null): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function isMaterialChange(a: number | null, b: number | null, relThreshold = 0.02): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.abs(b) < EPS) return Math.abs(a - b) > EPS;
  return Math.abs((a - b) / b) >= relThreshold;
}
