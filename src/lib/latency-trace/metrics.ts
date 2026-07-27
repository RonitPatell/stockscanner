import { prisma } from "../prisma.ts";
import { aggregateLatencyMs, getLatencyMetricsMinSamples } from "./aggregate.ts";
import type {
  LatencyAggregateStats,
  LatencySegmentReport,
  MetricCohort,
} from "./types.ts";
import { METRIC_COHORTS } from "./types.ts";

export type LatencyMetricWindowHours = 1 | 6 | 24 | 72 | 168;

export interface LatencyMetricsQuery {
  hours?: LatencyMetricWindowHours;
  minSamples?: number;
  /** When set, only these cohorts (public proof uses separated cohorts). */
  cohorts?: MetricCohort[];
  actionableOnly?: boolean;
}

type TraceRow = {
  source: string;
  sourceTier: string | null;
  marketSession: string | null;
  catalystType: string | null;
  timestampQuality: string;
  actionable: boolean;
  metricCohort: string;
  fetchLatencyMs: number | null;
  processingLatencyMs: number | null;
  deliveryLatencyMs: number | null;
  totalLatencyMs: number | null;
  symbol: string;
  headline: string | null;
  providerPublishedAt: Date | null;
  persistedAt: Date | null;
  firstDeliveryAttemptAt: Date | null;
  totalLatencyMsForExample?: number | null;
};

function sinceDate(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function packStats(
  rows: TraceRow[],
  pick: (r: TraceRow) => number | null | undefined,
  minSamples: number
): LatencyAggregateStats {
  return aggregateLatencyMs(
    rows.map(pick),
    minSamples
  );
}

function segmentLabel(parts: string[]): string {
  return parts.filter(Boolean).join(" · ") || "all";
}

function buildSegment(
  rows: TraceRow[],
  key: LatencySegmentReport["key"],
  label: string,
  minSamples: number
): LatencySegmentReport {
  return {
    key,
    label,
    total: packStats(rows, (r) => r.totalLatencyMs, minSamples),
    fetch: packStats(rows, (r) => r.fetchLatencyMs, minSamples),
    processing: packStats(rows, (r) => r.processingLatencyMs, minSamples),
    delivery: packStats(rows, (r) => r.deliveryLatencyMs, minSamples),
  };
}

async function loadRows(query: LatencyMetricsQuery): Promise<TraceRow[]> {
  const hours = query.hours ?? 24;
  const cohorts = query.cohorts;
  return prisma.latencyTrace.findMany({
    where: {
      createdAt: { gte: sinceDate(hours) },
      ...(cohorts && cohorts.length > 0 ? { metricCohort: { in: cohorts } } : {}),
      ...(query.actionableOnly ? { actionable: true } : {}),
    },
    select: {
      source: true,
      sourceTier: true,
      marketSession: true,
      catalystType: true,
      timestampQuality: true,
      actionable: true,
      metricCohort: true,
      fetchLatencyMs: true,
      processingLatencyMs: true,
      deliveryLatencyMs: true,
      totalLatencyMs: true,
      symbol: true,
      headline: true,
      providerPublishedAt: true,
      persistedAt: true,
      firstDeliveryAttemptAt: true,
    },
    take: 20_000,
    orderBy: { createdAt: "desc" },
  });
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export interface AdminLatencyDashboard {
  generatedAt: string;
  hours: number;
  minSamples: number;
  overall: LatencySegmentReport;
  /** Separated cohorts — never blended for public claims. */
  byCohort: LatencySegmentReport[];
  bySource: LatencySegmentReport[];
  bySourceTier: LatencySegmentReport[];
  byMarketSession: LatencySegmentReport[];
  byCatalystType: LatencySegmentReport[];
  byTimestampQuality: LatencySegmentReport[];
  byActionable: LatencySegmentReport[];
  sampleCount: number;
}

export async function getAdminLatencyDashboard(
  query: LatencyMetricsQuery = {}
): Promise<AdminLatencyDashboard> {
  const hours = query.hours ?? 24;
  const minSamples = query.minSamples ?? getLatencyMetricsMinSamples();
  const rows = await loadRows(query);

  const overall = buildSegment(rows, {}, "all", minSamples);

  const byCohort = METRIC_COHORTS.map((cohort) =>
    buildSegment(
      rows.filter((r) => r.metricCohort === cohort),
      { metricCohort: cohort },
      cohort,
      minSamples
    )
  );

  const bySource = [...groupBy(rows, (r) => r.source).entries()]
    .map(([source, list]) =>
      buildSegment(list, { source }, segmentLabel([source]), minSamples)
    )
    .sort((a, b) => b.total.count - a.total.count)
    .slice(0, 25);

  const bySourceTier = [...groupBy(rows, (r) => r.sourceTier ?? "unknown").entries()].map(
    ([tier, list]) =>
      buildSegment(list, { sourceTier: tier }, segmentLabel([tier]), minSamples)
  );

  const byMarketSession = [
    ...groupBy(rows, (r) => r.marketSession ?? "unknown").entries(),
  ].map(([session, list]) =>
    buildSegment(list, { marketSession: session }, segmentLabel([session]), minSamples)
  );

  const byCatalystType = [
    ...groupBy(rows, (r) => r.catalystType ?? "unknown").entries(),
  ]
    .map(([type, list]) =>
      buildSegment(list, { catalystType: type }, segmentLabel([type]), minSamples)
    )
    .sort((a, b) => b.total.count - a.total.count)
    .slice(0, 20);

  const byTimestampQuality = [
    ...groupBy(rows, (r) => r.timestampQuality).entries(),
  ].map(([q, list]) =>
    buildSegment(list, { timestampQuality: q }, segmentLabel([q]), minSamples)
  );

  const byActionable = [true, false].map((actionable) =>
    buildSegment(
      rows.filter((r) => r.actionable === actionable),
      { actionable },
      actionable ? "actionable" : "non_actionable",
      minSamples
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    hours,
    minSamples,
    overall,
    byCohort,
    bySource,
    bySourceTier,
    byMarketSession,
    byCatalystType,
    byTimestampQuality,
    byActionable,
    sampleCount: rows.length,
  };
}

export interface PublicLatencyProof {
  generatedAt: string;
  hours: number;
  minSamples: number;
  note: string;
  /** Separate public metrics — never a single blended speed claim across cohorts. */
  cohorts: Array<{
    cohort: MetricCohort;
    label: string;
    metrics: LatencyAggregateStats;
    available: boolean;
  }>;
  examples: Array<{
    cohort: MetricCohort;
    symbol: string;
    headline: string;
    totalLatencyMs: number;
    publishedAt: string | null;
    deliveredAt: string | null;
  }>;
}

const COHORT_LABELS: Record<MetricCohort, string> = {
  urgent_filing: "Urgent SEC filings",
  scheduled_earnings: "Scheduled earnings announcements",
  editorial_recap: "Editorial recaps / roundups",
  actionable_breaking: "Actionable breaking catalysts",
  other: "Other",
};

/** Sanitized public aggregates + verified examples (no raw IDs / URLs). */
export async function getPublicLatencyProof(
  query: LatencyMetricsQuery = {}
): Promise<PublicLatencyProof> {
  const hours = query.hours ?? 24;
  const minSamples = query.minSamples ?? getLatencyMetricsMinSamples();
  const rows = await loadRows({ hours, minSamples });

  const publicCohorts: MetricCohort[] = [
    "actionable_breaking",
    "urgent_filing",
    "scheduled_earnings",
    "editorial_recap",
  ];

  const cohorts = publicCohorts.map((cohort) => {
    const list = rows.filter((r) => r.metricCohort === cohort);
    const metrics = packStats(list, (r) => r.totalLatencyMs, minSamples);
    return {
      cohort,
      label: COHORT_LABELS[cohort],
      metrics,
      available: metrics.available,
    };
  });

  const examples: PublicLatencyProof["examples"] = [];
  for (const cohort of publicCohorts) {
    const candidates = rows
      .filter(
        (r) =>
          r.metricCohort === cohort &&
          r.totalLatencyMs != null &&
          r.totalLatencyMs >= 0 &&
          r.totalLatencyMs <= 180_000 &&
          r.timestampQuality !== "MISSING" &&
          r.timestampQuality !== "INVALID" &&
          r.headline
      )
      .sort((a, b) => (a.totalLatencyMs ?? 0) - (b.totalLatencyMs ?? 0))
      .slice(0, 3);

    for (const c of candidates) {
      examples.push({
        cohort,
        symbol: c.symbol,
        headline: (c.headline ?? "").slice(0, 160),
        totalLatencyMs: c.totalLatencyMs!,
        publishedAt: c.providerPublishedAt?.toISOString() ?? null,
        deliveredAt:
          c.firstDeliveryAttemptAt?.toISOString() ??
          c.persistedAt?.toISOString() ??
          null,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    hours,
    minSamples,
    note:
      "Metrics are segmented by cohort. Scheduled earnings, editorial recaps, and urgent filings are never combined into one public speed number. Values are unavailable below the minimum sample size.",
    cohorts,
    examples,
  };
}
