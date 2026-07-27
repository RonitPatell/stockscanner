import type { IndicatorId, MetricDefinition, ServiceTargets } from "./types.ts";

function num(env: string, fallback: number): number {
  const raw = process.env[env];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(env: string, fallback: boolean): boolean {
  const raw = process.env[env];
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * Configurable service targets via RELIABILITY_* env vars.
 * Do not display as achieved until productionVerified + adequate samples.
 */
export function getServiceTargets(
  overrides?: Partial<ServiceTargets>
): ServiceTargets {
  const base: ServiceTargets = {
    prioritySourceIngestionMin: num("RELIABILITY_PRIORITY_INGEST_MIN", 0.99),
    feedAvailabilityMarketHoursMin: num(
      "RELIABILITY_FEED_AVAIL_MARKET_HOURS_MIN",
      0.995
    ),
    inAppAlertDeliveryMin: num("RELIABILITY_ALERT_DELIVERY_MIN", 0.99),
    providerConnectionMin: num("RELIABILITY_PROVIDER_CONN_MIN", 0.98),
    processingLatencyP50MsMax: num("RELIABILITY_PROC_P50_MS_MAX", 2_000),
    processingLatencyP90MsMax: num("RELIABILITY_PROC_P90_MS_MAX", 10_000),
    upstreamLatencyP50MsMax: num("RELIABILITY_UPSTREAM_P50_MS_MAX", 15_000),
    upstreamLatencyP90MsMax: num("RELIABILITY_UPSTREAM_P90_MS_MAX", 60_000),
    duplicateRateMax: num("RELIABILITY_DUPLICATE_RATE_MAX", 0.02),
    timestampQualityRateMin: num("RELIABILITY_TIMESTAMP_QUALITY_MIN", 0.95),
    sourceCoverageMin: num("RELIABILITY_SOURCE_COVERAGE_MIN", 0.9),
    browserStreamSuccessMin: num("RELIABILITY_BROWSER_STREAM_MIN", 0.98),
    minSamplesForAchieved: Math.floor(
      num("RELIABILITY_MIN_SAMPLES_ACHIEVED", 100)
    ),
    productionVerified: bool("RELIABILITY_PRODUCTION_VERIFIED", false),
  };
  return { ...base, ...overrides };
}

export const METRIC_DEFINITIONS: Record<IndicatorId, MetricDefinition> = {
  priority_source_ingestion: {
    id: "priority_source_ingestion",
    name: "Priority-source ingestion availability",
    definition:
      "Share of scheduled priority-source tick windows that completed without circuit-open failure during the measurement window.",
    unit: "rate",
    direction: "higher_is_better",
  },
  feed_availability_market_hours: {
    id: "feed_availability_market_hours",
    name: "Feed availability (supported market hours)",
    definition:
      "Share of supported US equity market-hour minutes where the catalyst feed age stayed under the configured freshness threshold. Announced advance maintenance minutes are excluded when announcedAt < startedAt.",
    unit: "rate",
    direction: "higher_is_better",
  },
  in_app_alert_delivery: {
    id: "in_app_alert_delivery",
    name: "In-app alert-delivery availability",
    definition:
      "Share of in-app / SSE alert delivery attempts that reached delivered (not failed) during the window. Channel failures are counted; cooldowns/blocks are excluded from the denominator.",
    unit: "rate",
    direction: "higher_is_better",
  },
  provider_connection: {
    id: "provider_connection",
    name: "Provider connection availability",
    definition:
      "Share of provider connection probes/ticks that succeeded (HTTP/connect ok) across configured sources.",
    unit: "rate",
    direction: "higher_is_better",
  },
  latency_p50: {
    id: "latency_p50",
    name: "p50 TrustTicker processing latency",
    definition:
      "Median TrustTicker processing latency (fetch-complete → persisted), excluding upstream provider wait. Poor samples are retained.",
    unit: "ms",
    direction: "lower_is_better",
    latencyKind: "trustticker_processing",
  },
  latency_p90: {
    id: "latency_p90",
    name: "p90 TrustTicker processing latency",
    definition:
      "90th-percentile TrustTicker processing latency (fetch-complete → persisted), excluding upstream provider wait.",
    unit: "ms",
    direction: "lower_is_better",
    latencyKind: "trustticker_processing",
  },
  duplicate_rate: {
    id: "duplicate_rate",
    name: "Duplicate rate",
    definition:
      "Share of ingested items classified as duplicates of an already-seen provider item within the window.",
    unit: "rate",
    direction: "lower_is_better",
  },
  timestamp_quality_rate: {
    id: "timestamp_quality_rate",
    name: "Timestamp-quality rate",
    definition:
      "Share of latency traces with timestampQuality indicating a usable provider publish time (not missing/invalid/clock-skew).",
    unit: "rate",
    direction: "higher_is_better",
  },
  source_coverage: {
    id: "source_coverage",
    name: "Source coverage",
    definition:
      "Share of configured priority/licensed sources that reported at least one successful tick in the window.",
    unit: "rate",
    direction: "higher_is_better",
  },
  browser_stream_success: {
    id: "browser_stream_success",
    name: "Browser-stream connection success",
    definition:
      "Share of browser EventSource/SSE connection attempts that reached open and received a heartbeat or event within the handshake timeout.",
    unit: "rate",
    direction: "higher_is_better",
  },
};

export function targetFor(
  id: IndicatorId,
  targets: ServiceTargets
): number {
  switch (id) {
    case "priority_source_ingestion":
      return targets.prioritySourceIngestionMin;
    case "feed_availability_market_hours":
      return targets.feedAvailabilityMarketHoursMin;
    case "in_app_alert_delivery":
      return targets.inAppAlertDeliveryMin;
    case "provider_connection":
      return targets.providerConnectionMin;
    case "latency_p50":
      return targets.processingLatencyP50MsMax;
    case "latency_p90":
      return targets.processingLatencyP90MsMax;
    case "duplicate_rate":
      return targets.duplicateRateMax;
    case "timestamp_quality_rate":
      return targets.timestampQualityRateMin;
    case "source_coverage":
      return targets.sourceCoverageMin;
    case "browser_stream_success":
      return targets.browserStreamSuccessMin;
  }
}
