import {
  MIN_SAMPLE_FOR_PRECISION,
  MIN_SAMPLE_FOR_PUBLIC,
  PRIMARY_HORIZON,
  CALIBRATION_DISCLAIMER,
  type CalibrationCohortStats,
  type CalibrationReport,
  type HorizonMetrics,
} from "./types.ts";
import { mean, median, wilsonInterval } from "./buckets.ts";

export interface OutcomeRowForReport {
  catalystType: string | null;
  sourceTier: string | null;
  strength: string | null;
  confidenceBucket: string | null;
  floatBucket: string | null;
  liquidityBucket: string | null;
  marketSession: string | null;
  eligibleUrgent: boolean;
  rawReturnPct: number | null;
  spyRelativePct: number | null;
  /** Optional: 1 if classification direction matched subsequent move */
  directionHit?: boolean | null;
}

function cohort(
  dimension: string,
  value: string,
  rows: OutcomeRowForReport[],
  reactionThresholdPct: number
): CalibrationCohortStats {
  const eligible = rows.filter((r) => r.eligibleUrgent);
  const withReturn = eligible.filter((r) => r.rawReturnPct != null);
  const abs = withReturn.map((r) => Math.abs(r.rawReturnPct!));
  const reacted = withReturn.filter(
    (r) => Math.abs(r.rawReturnPct!) >= reactionThresholdPct
  );
  const spy = eligible
    .map((r) => r.spyRelativePct)
    .filter((x): x is number => x != null);

  const hits = eligible.filter((r) => r.directionHit === true).length;
  const hitDenom = eligible.filter((r) => r.directionHit === true || r.directionHit === false)
    .length;
  const precision = hitDenom > 0 ? hits / hitDenom : null;
  const reactionRate = withReturn.length > 0 ? reacted.length / withReturn.length : null;

  const rateForCi = precision ?? reactionRate;
  const successes =
    precision != null ? hits : reacted.length;
  const nForCi =
    precision != null ? hitDenom : withReturn.length;
  const ci =
    rateForCi != null && nForCi > 0 ? wilsonInterval(successes, nForCi) : null;

  const n = withReturn.length;
  const insufficient =
    n < MIN_SAMPLE_FOR_PRECISION ||
    (precision != null && hitDenom < MIN_SAMPLE_FOR_PRECISION);

  return {
    key: `${dimension}:${value}`,
    dimension,
    value,
    n,
    reactionRate:
      reactionRate != null ? Math.round(reactionRate * 1000) / 1000 : null,
    meanAbsReturnPct:
      mean(abs) != null ? Math.round(mean(abs)! * 100) / 100 : null,
    medianAbsReturnPct:
      median(abs) != null ? Math.round(median(abs)! * 100) / 100 : null,
    meanSpyRelativePct:
      mean(spy) != null ? Math.round(mean(spy)! * 100) / 100 : null,
    precision: precision != null ? Math.round(precision * 1000) / 1000 : null,
    ciLow: ci ? Math.round(ci.low * 1000) / 1000 : null,
    ciHigh: ci ? Math.round(ci.high * 1000) / 1000 : null,
    insufficientSample: insufficient,
    excludeUrgentCount: rows.length - eligible.length,
  };
}

function groupValues(
  rows: OutcomeRowForReport[],
  pick: (r: OutcomeRowForReport) => string | null | undefined
): Map<string, OutcomeRowForReport[]> {
  const m = new Map<string, OutcomeRowForReport[]>();
  for (const r of rows) {
    const v = pick(r) || "unknown";
    const list = m.get(v) ?? [];
    list.push(r);
    m.set(v, list);
  }
  return m;
}

/**
 * Build calibration report by dimensions.
 * Cohorts below MIN_SAMPLE_FOR_PUBLIC are included but flagged insufficientSample.
 */
export function buildCalibrationReport(
  rows: OutcomeRowForReport[],
  opts?: { reactionThresholdPct?: number }
): CalibrationReport {
  const reactionThresholdPct = opts?.reactionThresholdPct ?? 1.0;
  const cohorts: CalibrationCohortStats[] = [];

  const dims: Array<{
    dimension: string;
    pick: (r: OutcomeRowForReport) => string | null | undefined;
  }> = [
    { dimension: "catalystType", pick: (r) => r.catalystType },
    { dimension: "sourceTier", pick: (r) => r.sourceTier },
    { dimension: "strength", pick: (r) => r.strength },
    { dimension: "confidence", pick: (r) => r.confidenceBucket },
    { dimension: "floatBucket", pick: (r) => r.floatBucket },
    { dimension: "liquidityBucket", pick: (r) => r.liquidityBucket },
    { dimension: "marketSession", pick: (r) => r.marketSession },
  ];

  for (const { dimension, pick } of dims) {
    for (const [value, group] of groupValues(rows, pick)) {
      if (group.length < 1) continue;
      cohorts.push(cohort(dimension, value, group, reactionThresholdPct));
    }
  }

  // Overall
  cohorts.unshift(cohort("overall", "all", rows, reactionThresholdPct));

  return {
    version: "calibration-v1",
    generatedAt: new Date().toISOString(),
    primaryHorizon: PRIMARY_HORIZON,
    reactionThresholdPct,
    totalOutcomes: rows.length,
    eligibleUrgent: rows.filter((r) => r.eligibleUrgent).length,
    cohorts: cohorts.sort((a, b) => b.n - a.n),
    disclaimer: CALIBRATION_DISCLAIMER,
  };
}

/** Public-safe subset: hide cohorts under MIN_SAMPLE_FOR_PUBLIC. */
export function publicCalibrationSummary(report: CalibrationReport): CalibrationReport {
  return {
    ...report,
    cohorts: report.cohorts.filter(
      (c) => c.n >= MIN_SAMPLE_FOR_PUBLIC || c.dimension === "overall"
    ),
  };
}

export function directionHitFromMetrics(
  strengthDirection: "BULLISH" | "BEARISH" | "MIXED" | "UNKNOWN" | string | null | undefined,
  metrics: HorizonMetrics | null
): boolean | null {
  if (!metrics?.sampleValid || metrics.rawReturnPct == null) return null;
  const d = (strengthDirection || "").toUpperCase();
  if (d === "BULLISH" || d === "LONG" || d === "UP") return metrics.rawReturnPct > 0;
  if (d === "BEARISH" || d === "SHORT" || d === "DOWN") return metrics.rawReturnPct < 0;
  return null;
}
