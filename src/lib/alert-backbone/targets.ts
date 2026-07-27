import type { ServiceTargetConfig, TargetComparison } from "./types.ts";

/**
 * Configurable service targets — NOT marketing claims.
 * Override via ALERT_SLO_* env vars. Do not advertise achievement
 * until production measurements satisfy the target with adequate samples.
 */
export function getServiceTargets(): ServiceTargetConfig {
  return {
    providerToIngestionP50Ms: num("ALERT_SLO_PROVIDER_INGEST_P50_MS", 15_000),
    providerToIngestionP90Ms: num("ALERT_SLO_PROVIDER_INGEST_P90_MS", 60_000),
    ingestionToClassificationP50Ms: num("ALERT_SLO_INGEST_CLASSIFY_P50_MS", 250),
    ingestionToClassificationP90Ms: num("ALERT_SLO_INGEST_CLASSIFY_P90_MS", 2_000),
    classificationToInAppP50Ms: num("ALERT_SLO_CLASSIFY_INAPP_P50_MS", 3_000),
    classificationToInAppP90Ms: num("ALERT_SLO_CLASSIFY_INAPP_P90_MS", 10_000),
    alertChannelSuccessRateMin: num("ALERT_SLO_CHANNEL_SUCCESS_MIN", 0.95),
    duplicateRateMax: num("ALERT_SLO_DUPLICATE_RATE_MAX", 0.02),
    dataGapsPerHourMax: num("ALERT_SLO_DATA_GAPS_PER_HOUR_MAX", 5),
  };
}

function num(env: string, fallback: number): number {
  const raw = process.env[env];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const MIN_SAMPLES_FOR_ACHIEVED = 100;

export function compareTarget(input: {
  metric: string;
  target: number;
  measured: number | null;
  sampleSize: number;
  /** lower_is_better for latency; higher_is_better for success rates */
  direction: "lower_is_better" | "higher_is_better";
}): TargetComparison {
  const { metric, target, measured, sampleSize, direction } = input;
  if (measured == null || sampleSize < MIN_SAMPLES_FOR_ACHIEVED) {
    return {
      metric,
      target,
      measured,
      sampleSize,
      achieved: false,
      note:
        sampleSize < MIN_SAMPLES_FOR_ACHIEVED
          ? `Insufficient samples (n=${sampleSize}; need ≥${MIN_SAMPLES_FOR_ACHIEVED}). Not achieved.`
          : "No measurement. Not achieved.",
    };
  }
  const ok =
    direction === "lower_is_better" ? measured <= target : measured >= target;
  return {
    metric,
    target,
    measured,
    sampleSize,
    achieved: ok,
    note: ok
      ? "Measured value meets configured target (local/staging only until production confirms)."
      : "Measured value does not meet configured target.",
  };
}

/** Per-category max age before suppress (ms). */
export function getStaleAgeLimitsMs(): Record<string, number> {
  return {
    primary_filings: num("ALERT_STALE_FILINGS_MS", 2 * 60 * 60_000),
    licensed_news: num("ALERT_STALE_LICENSED_MS", 90 * 60_000),
    editorial_news: num("ALERT_STALE_EDITORIAL_MS", 4 * 60 * 60_000),
    market_events: num("ALERT_STALE_MARKET_MS", 30 * 60_000),
    enrichment: num("ALERT_STALE_ENRICHMENT_MS", 6 * 60 * 60_000),
    default: num("ALERT_STALE_DEFAULT_MS", 2 * 60 * 60_000),
  };
}
