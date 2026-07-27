import type {
  FloatBucket,
  LiquidityBucket,
  ConfidenceBucket,
  MarketSessionLabel,
  PriceSnapshot,
  PriceTimestampQuality,
  OutcomeHorizon,
} from "./types.ts";
import { marketSessionAt } from "../latency-trace/timestamps.ts";

const SCHEDULED_RE =
  /\b(scheduled|will\s+(report|announce|host)|upcoming|set\s+to\s+(report|announce)|conference\s+call\s+on|earnings\s+on|investor\s+day\s+on)\b/i;

const STALE_TRAP =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|still\s+plans|update\s+on\s+prior|previously\s+disclosed)\b/i;

const SPLIT_RE = /\b(reverse\s+stock\s+split|stock\s+split|1-for-\d+)\b/i;
const HALT_RE = /\b(trading\s+halt|halted|luld|volatility\s+pause)\b/i;

export function floatBucket(floatShares: number | null | undefined): FloatBucket {
  if (floatShares == null || floatShares <= 0) return "unknown";
  const m = floatShares / 1e6;
  if (m < 20) return "micro";
  if (m < 100) return "small";
  if (m < 500) return "mid";
  return "large";
}

export function liquidityBucket(opts: {
  dollarVolume?: number | null;
  volume?: number | null;
  price?: number | null;
  avgVolume?: number | null;
}): LiquidityBucket {
  const dollar =
    opts.dollarVolume ??
    (opts.price != null && opts.volume != null ? opts.price * opts.volume : null);
  if (dollar != null && dollar > 0) {
    if (dollar < 500_000) return "thin";
    if (dollar < 5_000_000) return "moderate";
    return "liquid";
  }
  if (opts.avgVolume != null && opts.volume != null && opts.avgVolume > 0) {
    const r = opts.volume / opts.avgVolume;
    if (r < 0.5) return "thin";
    if (r < 2) return "moderate";
    return "liquid";
  }
  return "unknown";
}

export function confidenceBucket(
  verifiedConfidence: number | null | undefined
): ConfidenceBucket {
  if (verifiedConfidence == null || !Number.isFinite(verifiedConfidence)) return "unknown";
  if (verifiedConfidence < 40) return "low";
  if (verifiedConfidence < 70) return "medium";
  return "high";
}

export function sessionAt(when: Date | string | null | undefined): MarketSessionLabel {
  const d = when instanceof Date ? when : when ? new Date(when) : null;
  const s = marketSessionAt(d);
  if (!s) return "unknown";
  if (s === "weekend") return "weekend";
  if (s === "premarket") return "premarket";
  if (s === "regular") return "regular";
  return "afterhours";
}

export interface EligibilityInput {
  headline: string;
  summary?: string | null;
  publishedAt: Date | string;
  ingestedAt?: Date | string | null;
  catalystType?: string | null;
  /** Judgment timing if known */
  timing?: string | null;
}

export interface EligibilityResult {
  eligibleUrgent: boolean;
  excludeReason: string | null;
}

/**
 * Scheduled / stale stories are excluded from urgent-catalyst performance cohorts.
 * They may still be stored for non-urgent calibration.
 */
export function classifyEligibility(input: EligibilityInput): EligibilityResult {
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.timing === "SCHEDULED" || SCHEDULED_RE.test(text)) {
    return { eligibleUrgent: false, excludeReason: "scheduled" };
  }
  if (input.timing === "STALE" || STALE_TRAP.test(text)) {
    return { eligibleUrgent: false, excludeReason: "stale" };
  }
  const pub = new Date(input.publishedAt).getTime();
  const ing = input.ingestedAt ? new Date(input.ingestedAt).getTime() : Date.now();
  if (Number.isFinite(pub) && Number.isFinite(ing) && ing - pub > 6 * 3600_000) {
    return { eligibleUrgent: false, excludeReason: "stale_age" };
  }
  if (HALT_RE.test(text)) {
    return { eligibleUrgent: false, excludeReason: "halt_language" };
  }
  if (SPLIT_RE.test(text)) {
    return { eligibleUrgent: false, excludeReason: "split_language" };
  }
  return { eligibleUrgent: true, excludeReason: null };
}

/** Wilson score interval for a binomial proportion. */
export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96
): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Detect extreme gap / possible split between two prices.
 * >40% move in <2 minutes without intermediate candles → GAP_EXTREME.
 * Near exact 2x/3x/4x/5x/10x ratio → SPLIT_ADJUST_SUSPECT.
 */
export function classifyPriceJump(
  from: number,
  to: number,
  lagSec: number
): PriceTimestampQuality | null {
  if (!(from > 0) || !(to > 0)) return "INVALID";
  const ratio = to / from;
  const absPct = Math.abs(ratio - 1) * 100;
  const splitFactors = [2, 3, 4, 5, 10, 0.5, 1 / 3, 0.25, 0.2, 0.1];
  for (const f of splitFactors) {
    if (Math.abs(ratio - f) / f < 0.03) return "SPLIT_ADJUST_SUSPECT";
  }
  if (lagSec <= 120 && absPct >= 40) return "GAP_EXTREME";
  return null;
}

export function emptySnapshot(
  horizon: OutcomeHorizon,
  targetAt: string | null,
  note?: string
): PriceSnapshot {
  return {
    horizon,
    price: null,
    observedAt: null,
    targetAt,
    source: "unknown",
    quality: "MISSING",
    substituted: false,
    substituteLagSec: null,
    volume: null,
    spreadPct: null,
    note,
  };
}
