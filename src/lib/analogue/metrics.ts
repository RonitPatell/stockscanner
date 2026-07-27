import { median, wilsonInterval } from "../calibration/buckets.ts";
import type {
  AnalogueAggregateStats,
  AnalogueHorizonKey,
  AnalogueMatch,
  HorizonDistribution,
} from "./types.ts";
import {
  ANALOGUE_HORIZONS,
  MIN_ANALOGUE_COMFORTABLE,
  MIN_ANALOGUE_SAMPLE,
} from "./types.ts";

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (idx - lo);
}

function round2(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function horizonDist(
  matches: AnalogueMatch[],
  horizon: AnalogueHorizonKey
): HorizonDistribution {
  const vals = matches
    .map((m) => m.outcome.returns[horizon])
    .filter((x): x is number => x != null && Number.isFinite(x));
  const reacted = vals.filter((v) => Math.abs(v) >= 1).length;
  const ci = vals.length > 0 ? wilsonInterval(reacted, vals.length) : null;
  const n = vals.length;
  return {
    horizon,
    n,
    medianPct: round2(median(vals)),
    p25Pct: round2(percentile(vals, 0.25)),
    p75Pct: round2(percentile(vals, 0.75)),
    reactionShare:
      n > 0 ? Math.round((reacted / n) * 1000) / 1000 : null,
    reactionShareCiLow: ci ? Math.round(ci.low * 1000) / 1000 : null,
    reactionShareCiHigh: ci ? Math.round(ci.high * 1000) / 1000 : null,
    insufficientSample: n < MIN_ANALOGUE_SAMPLE,
  };
}

/**
 * Aggregate descriptive statistics for analogue matches.
 * Never emits expected profit, target price, or probability of success.
 */
export function aggregateAnalogueStats(
  matches: AnalogueMatch[]
): AnalogueAggregateStats {
  const n = matches.length;
  const insufficientSample = n < MIN_ANALOGUE_SAMPLE;
  let smallSampleLabel: string | null = null;
  if (n === 0) smallSampleLabel = "No comparable events under current criteria.";
  else if (n < MIN_ANALOGUE_SAMPLE) {
    smallSampleLabel = `Small sample (n=${n}). Treat as anecdotal — not conclusive.`;
  } else if (n < MIN_ANALOGUE_COMFORTABLE) {
    smallSampleLabel = `Limited sample (n=${n}). Distributions are directional only.`;
  }

  const horizons = ANALOGUE_HORIZONS.map((h) => horizonDist(matches, h));

  const mfes = matches
    .map((m) => m.outcome.mfePct)
    .filter((x): x is number => x != null);
  const maes = matches
    .map((m) => m.outcome.maePct)
    .filter((x): x is number => x != null);

  const above = matches.filter((m) => m.outcome.stayedAboveEntry === true);
  const aboveDenom = matches.filter((m) => m.outcome.stayedAboveEntry != null);
  const aboveRate =
    aboveDenom.length > 0 ? above.length / aboveDenom.length : null;
  const aboveCi =
    aboveDenom.length > 0
      ? wilsonInterval(above.length, aboveDenom.length)
      : null;

  const below5 = matches.filter((m) => m.outcome.fellBelowFiveMin === true);
  const belowDenom = matches.filter((m) => m.outcome.fellBelowFiveMin != null);
  const belowRate =
    belowDenom.length > 0 ? below5.length / belowDenom.length : null;
  const belowCi =
    belowDenom.length > 0
      ? wilsonInterval(below5.length, belowDenom.length)
      : null;

  const spreads = matches
    .map((m) => m.outcome.medianSpreadPct)
    .filter((x): x is number => x != null);
  const liqs = matches
    .map((m) => m.outcome.liquidityDollarVol)
    .filter((x): x is number => x != null);

  const halted = matches.filter((m) => m.outcome.halted).length;
  const haltRate = n > 0 ? halted / n : null;
  const haltCi = n > 0 ? wilsonInterval(halted, n) : null;

  return {
    sampleSize: n,
    insufficientSample,
    smallSampleLabel,
    horizons,
    medianMfePct: round2(median(mfes)),
    medianMaePct: round2(median(maes)),
    pctRemainedAboveEventPrice:
      aboveRate != null ? Math.round(aboveRate * 1000) / 1000 : null,
    pctRemainedAboveEventPriceCi: aboveCi
      ? {
          low: Math.round(aboveCi.low * 1000) / 1000,
          high: Math.round(aboveCi.high * 1000) / 1000,
        }
      : null,
    pctFellBelowFiveMinPrice:
      belowRate != null ? Math.round(belowRate * 1000) / 1000 : null,
    pctFellBelowFiveMinPriceCi: belowCi
      ? {
          low: Math.round(belowCi.low * 1000) / 1000,
          high: Math.round(belowCi.high * 1000) / 1000,
        }
      : null,
    medianSpreadPct: round2(median(spreads)),
    medianLiquidityDollarVol: round2(median(liqs)),
    haltFrequency: haltRate != null ? Math.round(haltRate * 1000) / 1000 : null,
    haltFrequencyCi: haltCi
      ? {
          low: Math.round(haltCi.low * 1000) / 1000,
          high: Math.round(haltCi.high * 1000) / 1000,
        }
      : null,
  };
}
