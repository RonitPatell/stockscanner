import type { LatencyAggregateStats } from "./types.ts";

export function getLatencyMetricsMinSamples(): number {
  const n = Number(process.env.LATENCY_METRICS_MIN_SAMPLES ?? "20");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const w = rank - lo;
  return Math.round(sorted[lo] * (1 - w) + sorted[hi] * w);
}

function pctUnder(values: number[], thresholdMs: number): number | null {
  if (values.length === 0) return null;
  const hits = values.filter((v) => v <= thresholdMs).length;
  return Math.round((hits / values.length) * 1000) / 10;
}

/** Aggregate latency samples (milliseconds). Marks unavailable below min sample size. */
export function aggregateLatencyMs(
  values: Array<number | null | undefined>,
  minSamples = getLatencyMetricsMinSamples()
): LatencyAggregateStats {
  const nums = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  const count = nums.length;
  if (count < minSamples) {
    return {
      count,
      available: false,
      min: null,
      max: null,
      p50: null,
      p90: null,
      p99: null,
      pctUnder30s: null,
      pctUnder60s: null,
      pctUnder90s: null,
      pctUnder180s: null,
    };
  }

  return {
    count,
    available: true,
    min: nums[0],
    max: nums[nums.length - 1],
    p50: percentileSorted(nums, 50),
    p90: percentileSorted(nums, 90),
    p99: percentileSorted(nums, 99),
    pctUnder30s: pctUnder(nums, 30_000),
    pctUnder60s: pctUnder(nums, 60_000),
    pctUnder90s: pctUnder(nums, 90_000),
    pctUnder180s: pctUnder(nums, 180_000),
  };
}
