/**
 * YoY / QoQ / bps / share-count change — UNKNOWN when incomparable.
 */

import {
  durationDays,
  durationLengthsComparable,
  durationsComparableForYoy,
  fiscalPeriodsConsecutive,
} from "./periods.ts";
import type {
  FinancialMetricKey,
  MetricDeltaResult,
  NormalizedMetricObservation,
} from "./types.ts";

function isMarginKey(k: FinancialMetricKey): boolean {
  return k === "gross_margin" || k === "operating_margin";
}

function isShareKey(k: FinancialMetricKey): boolean {
  return k === "diluted_shares" || k === "shares_outstanding";
}

function absChange(
  curr: number | null,
  prior: number | null
): number | null {
  if (curr == null || prior == null) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prior)) return null;
  const d = curr - prior;
  return Number.isFinite(d) ? d : null;
}

function pctChange(
  curr: number | null,
  prior: number | null
): number | null {
  if (curr == null || prior == null) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prior)) return null;
  if (prior === 0) return null; // UNKNOWN — never Infinity / 0%
  const d = ((curr - prior) / Math.abs(prior)) * 100;
  return Number.isFinite(d) ? d : null;
}

function bpsChange(
  curr: number | null,
  prior: number | null
): number | null {
  // Margins stored as percent points → 1 percent point = 100 bps
  if (curr == null || prior == null) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prior)) return null;
  const d = (curr - prior) * 100;
  return Number.isFinite(d) ? d : null;
}

function unknownDelta(
  kind: MetricDeltaResult["kind"],
  metricKey: FinancialMetricKey,
  current: NormalizedMetricObservation,
  reason: string
): MetricDeltaResult {
  return {
    kind,
    metricKey,
    current,
    prior: null,
    absoluteChange: null,
    percentChange: null,
    bpsChange: null,
    comparable: false,
    reason,
  };
}

/**
 * Find prior-year observation for YoY (same fiscalPeriod, prior fiscalYear,
 * or periodEnd ~365 days earlier with compatible duration).
 */
export function findYoyPrior(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[]
): NormalizedMetricObservation | null {
  const candidates = pool.filter(
    (p) =>
      p.metricKey === current.metricKey &&
      p.fingerprint !== current.fingerprint &&
      p.value != null
  );

  if (current.fiscalYear != null && current.fiscalPeriod) {
    const hit = candidates.find(
      (p) =>
        p.fiscalYear === current.fiscalYear! - 1 &&
        p.fiscalPeriod === current.fiscalPeriod &&
        (p.unit === current.unit || !p.unit || !current.unit)
    );
    if (hit) {
      const cmp = durationsComparableForYoy(
        {
          fiscalPeriod: current.fiscalPeriod,
          days: durationDays(current.periodStart, current.periodEnd),
        },
        {
          fiscalPeriod: hit.fiscalPeriod,
          days: durationDays(hit.periodStart, hit.periodEnd),
        }
      );
      if (cmp.ok) return hit;
    }
  }

  if (!current.periodEnd) return null;
  const target = current.periodEnd.getTime() - 365 * 86_400_000;
  let best: NormalizedMetricObservation | null = null;
  let bestDist = Infinity;
  for (const p of candidates) {
    if (!p.periodEnd) continue;
    const dist = Math.abs(p.periodEnd.getTime() - target);
    if (dist > 45 * 86_400_000) continue;
    const cmp = durationsComparableForYoy(
      {
        fiscalPeriod: current.fiscalPeriod,
        days: durationDays(current.periodStart, current.periodEnd),
      },
      {
        fiscalPeriod: p.fiscalPeriod,
        days: durationDays(p.periodStart, p.periodEnd),
      }
    );
    if (!cmp.ok) continue;
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function findQoqPrior(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[]
): NormalizedMetricObservation | null {
  const candidates = pool.filter(
    (p) =>
      p.metricKey === current.metricKey &&
      p.fingerprint !== current.fingerprint &&
      p.value != null
  );

  for (const p of candidates) {
    if (
      fiscalPeriodsConsecutive(
        {
          fiscalYear: p.fiscalYear,
          fiscalPeriod: p.fiscalPeriod,
        },
        {
          fiscalYear: current.fiscalYear,
          fiscalPeriod: current.fiscalPeriod,
        }
      )
    ) {
      const cmp = durationLengthsComparable(
        durationDays(current.periodStart, current.periodEnd),
        durationDays(p.periodStart, p.periodEnd)
      );
      if (cmp.ok) return p;
    }
  }
  return null;
}

export function computeYoyDelta(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[]
): MetricDeltaResult {
  if (current.value == null) {
    return unknownDelta("yoy", current.metricKey, current, "Current value UNKNOWN");
  }
  const prior = findYoyPrior(current, pool);
  if (!prior) {
    return unknownDelta(
      "yoy",
      current.metricKey,
      current,
      "No comparable prior-year period"
    );
  }
  const percentChange = pctChange(current.value, prior.value);
  return {
    kind: "yoy",
    metricKey: current.metricKey,
    current,
    prior,
    absoluteChange: absChange(current.value, prior.value),
    percentChange,
    bpsChange: isMarginKey(current.metricKey)
      ? bpsChange(current.value, prior.value)
      : null,
    comparable: true,
    reason:
      prior.value === 0
        ? "Percent change unavailable (prior value is zero)"
        : null,
  };
}

export function computeQoqDelta(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[]
): MetricDeltaResult {
  if (current.value == null) {
    return unknownDelta("qoq", current.metricKey, current, "Current value UNKNOWN");
  }
  if (current.fiscalPeriod === "FY") {
    return unknownDelta(
      "qoq",
      current.metricKey,
      current,
      "Annual (FY) periods are not QoQ-comparable"
    );
  }
  const prior = findQoqPrior(current, pool);
  if (!prior) {
    return unknownDelta(
      "qoq",
      current.metricKey,
      current,
      "No comparable prior quarter"
    );
  }
  return {
    kind: "qoq",
    metricKey: current.metricKey,
    current,
    prior,
    absoluteChange: absChange(current.value, prior.value),
    percentChange: pctChange(current.value, prior.value),
    bpsChange: isMarginKey(current.metricKey)
      ? bpsChange(current.value, prior.value)
      : null,
    comparable: true,
    reason:
      prior.value === 0
        ? "Percent change unavailable (prior value is zero)"
        : null,
  };
}

export function computeShareCountChange(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[],
  mode: "yoy" | "qoq" = "yoy"
): MetricDeltaResult {
  if (!isShareKey(current.metricKey)) {
    return unknownDelta(
      "share_count",
      current.metricKey,
      current,
      "Not a share-count metric"
    );
  }
  const base =
    mode === "yoy"
      ? computeYoyDelta(current, pool)
      : computeQoqDelta(current, pool);
  return {
    ...base,
    kind: "share_count",
    bpsChange: null,
  };
}

export function computeMarginBpsChange(
  current: NormalizedMetricObservation,
  pool: NormalizedMetricObservation[],
  mode: "yoy" | "qoq" = "yoy"
): MetricDeltaResult {
  if (!isMarginKey(current.metricKey)) {
    return unknownDelta(
      "bps",
      current.metricKey,
      current,
      "Not a margin metric"
    );
  }
  const base =
    mode === "yoy"
      ? computeYoyDelta(current, pool)
      : computeQoqDelta(current, pool);
  return {
    ...base,
    kind: "bps",
  };
}
