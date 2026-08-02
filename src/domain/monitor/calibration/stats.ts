/**
 * Sample sizes and confidence intervals — descriptive only.
 * No predicted profit / expected return / P(win) / target price.
 */

export interface MeanCI {
  n: number;
  mean: number;
  ci95Low: number;
  ci95High: number;
}

export interface ProportionCI {
  n: number;
  count: number;
  rate: number;
  ci95Low: number;
  ci95High: number;
}

/** Normal approx 95% CI for mean (z=1.96). Degenerate when n < 2. */
export function meanWithCI(values: number[]): MeanCI {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, ci95Low: 0, ci95High: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, mean, ci95Low: mean, ci95High: mean };
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  const half = 1.96 * se;
  return { n, mean, ci95Low: mean - half, ci95High: mean + half };
}

/** Wilson score interval for a proportion. */
export function proportionWithCI(count: number, n: number): ProportionCI {
  if (n <= 0) return { n: 0, count: 0, rate: 0, ci95Low: 0, ci95High: 0 };
  const z = 1.96;
  const p = count / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    n,
    count,
    rate: p,
    ci95Low: Math.max(0, center - margin),
    ci95High: Math.min(1, center + margin),
  };
}

export function histogram(values: number[], bins: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < bins.length - 1; i++) {
    out[`${bins[i]}-${bins[i + 1]}`] = 0;
  }
  out[`${bins[bins.length - 1]}+`] = 0;
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < bins.length - 1; i++) {
      if (v >= bins[i]! && v < bins[i + 1]!) {
        out[`${bins[i]}-${bins[i + 1]}`]! += 1;
        placed = true;
        break;
      }
    }
    if (!placed) out[`${bins[bins.length - 1]}+`]! += 1;
  }
  return out;
}
