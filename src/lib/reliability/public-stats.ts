import { p50, p90, sortedFinite } from "./indicators.ts";
import type { AggregatedPublicLatency, LiveConnectionStatus } from "./types.ts";

/**
 * Reproducible aggregated public latency — no cherry-picking.
 * Separates TrustTicker processing from upstream-provider latency.
 */
export function aggregatePublicLatency(input: {
  windowHours: number;
  processingMs: Array<number | null | undefined>;
  upstreamMs: Array<number | null | undefined>;
  totalMs: Array<number | null | undefined>;
  minSamples?: number;
}): AggregatedPublicLatency {
  const minSamples = input.minSamples ?? 20;
  const processing = sortedFinite(input.processingMs);
  const upstream = sortedFinite(input.upstreamMs);
  const total = sortedFinite(input.totalMs);
  // Use the largest aligned cohort size for n; prefer total count
  const sampleSize = Math.max(processing.length, upstream.length, total.length);
  const available = sampleSize >= minSamples;

  const under = (thresholdMs: number) => {
    if (total.length === 0) return null;
    return (
      Math.round(
        (total.filter((v) => v <= thresholdMs).length / total.length) * 1000
      ) / 10
    );
  };

  return {
    windowHours: input.windowHours,
    sampleSize,
    processing: {
      p50Ms: available ? p50(processing) : null,
      p90Ms: available ? p90(processing) : null,
      definition:
        "TrustTicker processing latency: fetch-complete → persisted (excludes upstream provider wait).",
    },
    upstream: {
      p50Ms: available ? p50(upstream) : null,
      p90Ms: available ? p90(upstream) : null,
      definition:
        "Upstream-provider latency: provider publish/fetch wait before TrustTicker processing.",
    },
    total: {
      p50Ms: available ? p50(total) : null,
      p90Ms: available ? p90(total) : null,
      definition:
        "Total observed latency including upstream and TrustTicker processing. Includes poor-performing samples.",
    },
    under3mRate: available ? under(180_000) : null,
    under60sRate: available ? under(60_000) : null,
    available,
    note: available
      ? `Aggregated over n=${sampleSize} samples in the last ${input.windowHours}h. No cherry-picking; slow samples retained.`
      : `Insufficient samples (n=${sampleSize}; need ≥${minSamples}). Metrics unavailable.`,
  };
}

export function buildLiveConnectionStatus(input: {
  feedOk: boolean;
  feedSamples: number;
  streamSuccessRate: number | null;
  streamSamples: number;
  alertDeliveryRate: number | null;
  alertSamples: number;
}): LiveConnectionStatus {
  const streamStatus =
    input.streamSamples <= 0
      ? "insufficient_data"
      : (input.streamSuccessRate ?? 0) >= 0.95
        ? "operational"
        : (input.streamSuccessRate ?? 0) >= 0.5
          ? "degraded"
          : "outage";

  const alertStatus =
    input.alertSamples <= 0
      ? "insufficient_data"
      : (input.alertDeliveryRate ?? 0) >= 0.95
        ? "operational"
        : (input.alertDeliveryRate ?? 0) >= 0.5
          ? "degraded"
          : "outage";

  const feedStatus: LiveConnectionStatus["feed"] = input.feedOk
    ? "operational"
    : input.feedSamples > 0
      ? "degraded"
      : "insufficient_data";

  let label = "Connection status unknown";
  if (
    feedStatus === "operational" &&
    streamStatus === "operational" &&
    (alertStatus === "operational" || alertStatus === "insufficient_data")
  ) {
    label = "Live connection healthy";
  } else if (streamStatus === "outage" || alertStatus === "outage") {
    label = "Live connection disrupted";
  } else if (
    feedStatus === "degraded" ||
    streamStatus === "degraded" ||
    alertStatus === "degraded"
  ) {
    label = "Live connection degraded";
  }

  return {
    feed: feedStatus,
    browserStream: streamStatus,
    alertDelivery: alertStatus,
    label,
    updatedAt: new Date().toISOString(),
    sampleSizes: {
      feed: input.feedSamples,
      browserStream: input.streamSamples,
      alertDelivery: input.alertSamples,
    },
  };
}
