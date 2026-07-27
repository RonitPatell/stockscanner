import { METRIC_DEFINITIONS, targetFor } from "./targets.ts";
import type {
  IndicatorId,
  IndicatorResult,
  IndicatorSample,
  IndicatorStatus,
  ServiceTargets,
  SourceDegradationNotice,
} from "./types.ts";

function percentileSorted(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const w = rank - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

/** Sort ascending; keep all samples including poor performers. */
export function sortedFinite(values: Array<number | null | undefined>): number[] {
  return values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
}

export function rate(successes: number, attempts: number): number | null {
  if (attempts <= 0) return null;
  return successes / attempts;
}

export function p50(values: number[]): number | null {
  return percentileSorted(sortedFinite(values), 50);
}

export function p90(values: number[]): number | null {
  return percentileSorted(sortedFinite(values), 90);
}

function statusFrom(
  id: IndicatorId,
  measured: number | null,
  sampleSize: number,
  target: number,
  targets: ServiceTargets,
  direction: "higher_is_better" | "lower_is_better"
): { status: IndicatorStatus; achieved: boolean; note: string } {
  if (measured == null || sampleSize <= 0) {
    return {
      status: "insufficient_data",
      achieved: false,
      note: `No measurement (n=${sampleSize}). Not achieved.`,
    };
  }
  if (sampleSize < targets.minSamplesForAchieved) {
    const meets =
      direction === "higher_is_better" ? measured >= target : measured <= target;
    return {
      status: meets ? "operational" : measured === 0 && direction === "higher_is_better" ? "outage" : "degraded",
      achieved: false,
      note: `Insufficient samples (n=${sampleSize}; need ≥${targets.minSamplesForAchieved}). Target not marked achieved.`,
    };
  }

  const meets =
    direction === "higher_is_better" ? measured >= target : measured <= target;

  let status: IndicatorStatus;
  if (direction === "higher_is_better") {
    if (measured >= target) status = "operational";
    else if (measured >= target * 0.9) status = "degraded";
    else if (measured <= 0.1) status = "outage";
    else status = "degraded";
  } else {
    if (measured <= target) status = "operational";
    else if (measured <= target * 1.5) status = "degraded";
    else status = "outage";
  }

  // Special-case hard outages for availability rates
  if (
    direction === "higher_is_better" &&
    (id === "provider_connection" ||
      id === "priority_source_ingestion" ||
      id === "feed_availability_market_hours" ||
      id === "in_app_alert_delivery") &&
    measured < 0.5
  ) {
    status = "outage";
  }

  if (!targets.productionVerified) {
    return {
      status,
      achieved: false,
      note: meets
        ? "Measured value meets configured target, but production verification flag is off — not displayed as achieved."
        : "Measured value does not meet configured target. Not achieved.",
    };
  }

  return {
    status,
    achieved: meets,
    note: meets
      ? "Measured value meets configured target with adequate production samples."
      : "Measured value does not meet configured target.",
  };
}

export function evaluateIndicator(
  sample: IndicatorSample,
  targets: ServiceTargets
): IndicatorResult {
  const def = METRIC_DEFINITIONS[sample.id];
  const target = targetFor(sample.id, targets);
  const { status, achieved, note } = statusFrom(
    sample.id,
    sample.measured,
    sample.sampleSize,
    target,
    targets,
    def.direction
  );
  return {
    id: sample.id,
    name: def.name,
    definition: def.definition,
    unit: def.unit,
    measured: sample.measured,
    target,
    sampleSize: sample.sampleSize,
    status,
    achieved,
    note:
      sample.notes && sample.notes.length
        ? `${note} ${sample.notes.join(" ")}`
        : note,
    latencyKind: def.latencyKind,
  };
}

export function evaluateAllIndicators(
  samples: IndicatorSample[],
  targets: ServiceTargets
): IndicatorResult[] {
  const byId = new Map(samples.map((s) => [s.id, s]));
  const ids = Object.keys(METRIC_DEFINITIONS) as IndicatorId[];
  return ids.map((id) => {
    const sample =
      byId.get(id) ??
      ({
        id,
        measured: null,
        sampleSize: 0,
        windowStart: new Date(0).toISOString(),
        windowEnd: new Date(0).toISOString(),
        excludedMaintenanceMinutes: 0,
      } satisfies IndicatorSample);
    return evaluateIndicator(sample, targets);
  });
}

/** Build samples from raw counters — used by tests and collectors. */
export function sampleFromRate(input: {
  id: IndicatorId;
  successes: number;
  attempts: number;
  windowStart: string;
  windowEnd: string;
  excludedMaintenanceMinutes?: number;
  notes?: string[];
}): IndicatorSample {
  return {
    id: input.id,
    measured: rate(input.successes, input.attempts),
    sampleSize: input.attempts,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    excludedMaintenanceMinutes: input.excludedMaintenanceMinutes ?? 0,
    notes: input.notes,
  };
}

export function sampleFromLatencyPercentile(input: {
  id: "latency_p50" | "latency_p90";
  valuesMs: number[];
  windowStart: string;
  windowEnd: string;
}): IndicatorSample {
  const sorted = sortedFinite(input.valuesMs);
  const measured =
    input.id === "latency_p50" ? p50(sorted) : p90(sorted);
  return {
    id: input.id,
    measured,
    sampleSize: sorted.length,
    rawSamples: sorted, // preserve poor performers
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    excludedMaintenanceMinutes: 0,
  };
}

export function sourceDegradationNotices(
  sources: Array<{
    source: string;
    successes: number;
    attempts: number;
    since: string;
  }>,
  minAvailability: number
): SourceDegradationNotice[] {
  const out: SourceDegradationNotice[] = [];
  for (const s of sources) {
    const measured = rate(s.successes, s.attempts);
    if (measured == null) continue;
    if (measured >= minAvailability) continue;
    let status: IndicatorStatus = "degraded";
    if (measured < 0.5) status = "outage";
    out.push({
      source: s.source,
      status,
      message:
        status === "outage"
          ? `${s.source} provider connection is in outage (availability ${(measured * 100).toFixed(1)}%, n=${s.attempts}).`
          : `${s.source} is degraded (availability ${(measured * 100).toFixed(1)}%, n=${s.attempts}).`,
      since: s.since,
      sampleSize: s.attempts,
      measuredAvailability: measured,
    });
  }
  return out.sort((a, b) =>
    (a.measuredAvailability ?? 1) - (b.measuredAvailability ?? 1)
  );
}

/**
 * Timestamp quality: count usable vs total.
 * Incorrect / missing / invalid timestamps reduce the rate.
 */
export function timestampQualityRate(
  qualities: string[]
): { rate: number | null; sampleSize: number; bad: number } {
  const sampleSize = qualities.length;
  if (sampleSize === 0) return { rate: null, sampleSize: 0, bad: 0 };
  const badLabels = new Set([
    "missing",
    "invalid",
    "clock_skew",
    "incorrect",
    "unknown",
    "unusable",
  ]);
  const bad = qualities.filter((q) =>
    badLabels.has(String(q).toLowerCase())
  ).length;
  return { rate: (sampleSize - bad) / sampleSize, sampleSize, bad };
}
