import { prisma } from "../prisma.ts";
import { getServiceTargets, compareTarget } from "./targets.ts";
import { channelSuccessRates } from "./delivery-log.ts";
import { getDataGapsThisHour } from "./heartbeats.ts";
import { getQueueDepths } from "./queues.ts";
import type { TargetComparison } from "./types.ts";

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx] ?? null;
}

function aggregate(values: number[]): {
  count: number;
  p50: number | null;
  p90: number | null;
} {
  const nums = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return {
    count: nums.length,
    p50: percentile(nums, 50),
    p90: percentile(nums, 90),
  };
}

/**
 * Measured latency segments from LatencyTrace.
 * Never claims targets achieved without adequate production samples.
 */
export async function measureBackboneLatencies(hours = 24): Promise<{
  providerToIngestion: ReturnType<typeof aggregate>;
  ingestionToClassification: ReturnType<typeof aggregate>;
  classificationToInApp: ReturnType<typeof aggregate>;
  comparisons: TargetComparison[];
  disclaimer: string;
}> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.latencyTrace.findMany({
    where: { createdAt: { gte: since } },
    select: {
      providerPublishedAt: true,
      firstFetchedAt: true,
      classifiedAt: true,
      persistedAt: true,
      firstDeliveryAttemptAt: true,
      fetchLatencyMs: true,
      processingLatencyMs: true,
      deliveryLatencyMs: true,
    },
    take: 5_000,
  });

  const providerToIngestion: number[] = [];
  const ingestionToClassification: number[] = [];
  const classificationToInApp: number[] = [];

  for (const r of rows) {
    if (r.fetchLatencyMs != null) providerToIngestion.push(r.fetchLatencyMs);
    else if (r.providerPublishedAt && r.firstFetchedAt) {
      providerToIngestion.push(
        r.firstFetchedAt.getTime() - r.providerPublishedAt.getTime()
      );
    }
    if (r.processingLatencyMs != null) {
      ingestionToClassification.push(r.processingLatencyMs);
    } else if (r.firstFetchedAt && r.classifiedAt) {
      ingestionToClassification.push(
        r.classifiedAt.getTime() - r.firstFetchedAt.getTime()
      );
    }
    if (r.deliveryLatencyMs != null) {
      classificationToInApp.push(r.deliveryLatencyMs);
    } else if (r.classifiedAt && r.firstDeliveryAttemptAt) {
      classificationToInApp.push(
        r.firstDeliveryAttemptAt.getTime() - r.classifiedAt.getTime()
      );
    }
  }

  const a = aggregate(providerToIngestion);
  const b = aggregate(ingestionToClassification);
  const c = aggregate(classificationToInApp);
  const targets = getServiceTargets();

  const comparisons: TargetComparison[] = [
    compareTarget({
      metric: "provider_to_ingestion_p50",
      target: targets.providerToIngestionP50Ms,
      measured: a.p50,
      sampleSize: a.count,
      direction: "lower_is_better",
    }),
    compareTarget({
      metric: "provider_to_ingestion_p90",
      target: targets.providerToIngestionP90Ms,
      measured: a.p90,
      sampleSize: a.count,
      direction: "lower_is_better",
    }),
    compareTarget({
      metric: "ingestion_to_classification_p50",
      target: targets.ingestionToClassificationP50Ms,
      measured: b.p50,
      sampleSize: b.count,
      direction: "lower_is_better",
    }),
    compareTarget({
      metric: "ingestion_to_classification_p90",
      target: targets.ingestionToClassificationP90Ms,
      measured: b.p90,
      sampleSize: b.count,
      direction: "lower_is_better",
    }),
    compareTarget({
      metric: "classification_to_in_app_p50",
      target: targets.classificationToInAppP50Ms,
      measured: c.p50,
      sampleSize: c.count,
      direction: "lower_is_better",
    }),
    compareTarget({
      metric: "classification_to_in_app_p90",
      target: targets.classificationToInAppP90Ms,
      measured: c.p90,
      sampleSize: c.count,
      direction: "lower_is_better",
    }),
  ];

  return {
    providerToIngestion: a,
    ingestionToClassification: b,
    classificationToInApp: c,
    comparisons,
    disclaimer:
      "Configured targets are goals, not claims. achieved=true only when sample size ≥ 100 and measured value meets target. Local/staging results are not production SLOs.",
  };
}

export async function estimateDuplicateRate(hours = 24): Promise<{
  rate: number | null;
  sampleSize: number;
  comparison: TargetComparison;
}> {
  const since = new Date(Date.now() - hours * 3600_000);
  const logs = await prisma.alertLog.findMany({
    where: { createdAt: { gte: since }, status: "sent" },
    select: { userId: true, catalystId: true, channel: true },
    take: 10_000,
  });
  const keys = new Set<string>();
  let dupes = 0;
  for (const l of logs) {
    const k = `${l.userId}:${l.catalystId}:${l.channel}`;
    if (keys.has(k)) dupes++;
    else keys.add(k);
  }
  const sampleSize = logs.length;
  const rate = sampleSize > 0 ? dupes / sampleSize : null;
  const targets = getServiceTargets();
  return {
    rate,
    sampleSize,
    comparison: compareTarget({
      metric: "duplicate_rate",
      target: targets.duplicateRateMax,
      measured: rate,
      sampleSize,
      direction: "lower_is_better",
    }),
  };
}

export async function getBackboneMetricsSummary(hours = 24) {
  const [latencies, channels, gaps, queues, duplicates] = await Promise.all([
    measureBackboneLatencies(hours),
    channelSuccessRates(hours),
    getDataGapsThisHour(),
    getQueueDepths(),
    estimateDuplicateRate(hours),
  ]);

  const targets = getServiceTargets();
  const channelComparisons: TargetComparison[] = Object.entries(channels).map(
    ([ch, v]) =>
      compareTarget({
        metric: `channel_success_${ch}`,
        target: targets.alertChannelSuccessRateMin,
        measured: v.rate,
        sampleSize: v.sent + v.failed,
        direction: "higher_is_better",
      })
  );

  const gapComparison = compareTarget({
    metric: "data_gaps_per_hour",
    target: targets.dataGapsPerHourMax,
    measured: gaps,
    sampleSize: 1,
    direction: "lower_is_better",
  });
  // Single-hour count never "achieved" via sample size rule — keep honest
  gapComparison.achieved = false;
  gapComparison.note =
    "Hourly gap count is informational; do not claim SLO until multi-day production series exists.";

  return {
    hours,
    targets,
    latencies,
    channels,
    channelComparisons,
    dataGapsThisHour: gaps,
    gapComparison,
    queues,
    duplicates,
    disclaimer: latencies.disclaimer,
  };
}
