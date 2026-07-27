import { prisma } from "../prisma.ts";
import { isScaleMode } from "../redis.ts";
import {
  classifyFeedHealth,
  getSystemHealth,
} from "../system-health.ts";
import { getSourceHealth } from "../ingest/health.ts";
import { INGEST_SOURCES } from "../ingest/sources.ts";
import {
  evaluateAllIndicators,
  sampleFromLatencyPercentile,
  sampleFromRate,
  sourceDegradationNotices,
  timestampQualityRate,
} from "./indicators.ts";
import { maintenanceOverlapMinutes } from "./market-hours.ts";
import { getServiceTargets } from "./targets.ts";
import { aggregatePublicLatency, buildLiveConnectionStatus } from "./public-stats.ts";
import { buildMonthlyReliabilityReport } from "./report.ts";
import { buildIncidentTimeline } from "./incidents.ts";
import type {
  IndicatorResult,
  IndicatorSample,
  LiveConnectionStatus,
  MonthlyReliabilityReport,
  ServiceIncidentRecord,
  SourceDegradationNotice,
} from "./types.ts";
import {
  RELIABILITY_DISCLAIMER,
  STATUS_PAGE_LEGAL_PLACEHOLDER,
} from "./version.ts";

function iso(d: Date): string {
  return d.toISOString();
}

async function loadSourceHealthRows() {
  return Promise.all(
    INGEST_SOURCES.map(async (src) => {
      const h = await getSourceHealth(src.id, {
        tier: src.tier,
        enabled: true,
      });
      return { ...h, name: src.name, tier: src.tier, provider: src.provider };
    })
  );
}

/** Collect indicator samples from production telemetry. */
export async function collectIndicatorSamples(hours = 24): Promise<{
  samples: IndicatorSample[];
  sourceNotices: SourceDegradationNotice[];
  live: LiveConnectionStatus;
}> {
  const targets = getServiceTargets();
  const windowEnd = new Date();
  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const ws = iso(windowStart);
  const we = iso(windowEnd);

  const [traces, alertLogs, sourceHealth] = await Promise.all([
    prisma.latencyTrace.findMany({
      where: { createdAt: { gte: windowStart } },
      select: {
        processingLatencyMs: true,
        fetchLatencyMs: true,
        totalLatencyMs: true,
        timestampQuality: true,
        source: true,
        providerItemId: true,
        urlHash: true,
      },
      take: 5_000,
      orderBy: { createdAt: "desc" },
    }),
    prisma.alertLog.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { status: true },
      take: 5_000,
    }),
    loadSourceHealthRows().catch(() => []),
  ]);

  const processing = traces
    .map((t) => t.processingLatencyMs)
    .filter((v): v is number => v != null);

  const seen = new Set<string>();
  let dupes = 0;
  let dupAttempts = 0;
  for (const t of traces) {
    const key = t.providerItemId || t.urlHash;
    if (!key) continue;
    dupAttempts += 1;
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }

  const tq = timestampQualityRate(traces.map((t) => t.timestampQuality));

  const alertAttempts = alertLogs.filter(
    (a) => a.status === "sent" || a.status === "failed"
  ).length;
  const alertOk = alertLogs.filter((a) => a.status === "sent").length;

  const priorityPool = sourceHealth.filter((s) => s.tier === 0 || s.tier === 1);
  let priOk = 0;
  let priN = 0;
  let provOk = 0;
  let provN = 0;
  const sourceRows: Array<{
    source: string;
    successes: number;
    attempts: number;
    since: string;
  }> = [];

  for (const s of sourceHealth) {
    const ok = s.circuit !== "open" && s.lastSuccessAt != null ? 1 : 0;
    const fail =
      s.circuit === "open" || (s.consecutiveFailures > 0 && !s.lastSuccessAt)
        ? 1
        : ok
          ? 0
          : 1;
    const successes = ok;
    const attempts = successes + (fail || (ok ? 0 : 1));
    // Snapshot probe: one observation per source
    const attemptsN = 1;
    const successN = s.circuit === "open" ? 0 : s.lastSuccessAt ? 1 : 0;
    provOk += successN;
    provN += attemptsN;
    sourceRows.push({
      source: s.sourceId,
      successes: successN,
      attempts: attemptsN,
      since: s.lastFailureAt ?? s.lastSuccessAt ?? ws,
    });
    void attempts;
  }

  for (const s of priorityPool) {
    const successN = s.circuit === "open" ? 0 : s.lastSuccessAt ? 1 : 0;
    priOk += successN;
    priN += 1;
  }

  const configuredSources = Math.max(sourceHealth.length, 1);
  const covered = sourceRows.filter((s) => s.successes > 0).length;

  const health = getSystemHealth(isScaleMode());
  const freshness = classifyFeedHealth(health);
  const feedFresh =
    freshness.status === "live" || freshness.status === "ingesting" ? 1 : 0;

  const streamOk = health.browserStreamSuccesses;
  const streamFail = health.browserStreamFailures;
  const streamN = streamOk + streamFail;

  let excluded = 0;
  try {
    const maintIncidents = await prisma.serviceIncident.findMany({
      where: {
        announcedMaintenance: true,
        startedAt: { lte: windowEnd },
        OR: [{ endedAt: null }, { endedAt: { gte: windowStart } }],
      },
      select: {
        startedAt: true,
        endedAt: true,
        announcedMaintenance: true,
        announcedAt: true,
      },
    });
    excluded = maintenanceOverlapMinutes({
      windowStart,
      windowEnd,
      maintenance: maintIncidents.map((m) => ({
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        announcedMaintenance: m.announcedMaintenance,
        announcedAt: m.announcedAt,
      })),
      marketHoursOnly: true,
    });
  } catch {
    excluded = 0;
  }

  const samples: IndicatorSample[] = [
    sampleFromRate({
      id: "priority_source_ingestion",
      successes: priOk,
      attempts: priN,
      windowStart: ws,
      windowEnd: we,
      notes: priN === 0 ? ["No priority-source ticks in window."] : undefined,
    }),
    sampleFromRate({
      id: "feed_availability_market_hours",
      successes: feedFresh,
      attempts: 1,
      windowStart: ws,
      windowEnd: we,
      excludedMaintenanceMinutes: excluded,
      notes: [
        "Snapshot-based until minute-resolution feed probes are stored. Announced advance maintenance minutes excluded when applicable.",
      ],
    }),
    sampleFromRate({
      id: "in_app_alert_delivery",
      successes: alertOk,
      attempts: alertAttempts,
      windowStart: ws,
      windowEnd: we,
    }),
    sampleFromRate({
      id: "provider_connection",
      successes: provOk,
      attempts: provN,
      windowStart: ws,
      windowEnd: we,
    }),
    sampleFromLatencyPercentile({
      id: "latency_p50",
      valuesMs: processing,
      windowStart: ws,
      windowEnd: we,
    }),
    sampleFromLatencyPercentile({
      id: "latency_p90",
      valuesMs: processing,
      windowStart: ws,
      windowEnd: we,
    }),
    {
      id: "duplicate_rate",
      measured: dupAttempts > 0 ? dupes / dupAttempts : null,
      sampleSize: dupAttempts,
      windowStart: ws,
      windowEnd: we,
      excludedMaintenanceMinutes: 0,
      notes: ["Duplicate fraction (lower is better). Poor samples retained."],
    },
    {
      id: "timestamp_quality_rate",
      measured: tq.rate,
      sampleSize: tq.sampleSize,
      windowStart: ws,
      windowEnd: we,
      excludedMaintenanceMinutes: 0,
      notes:
        tq.bad > 0
          ? [`${tq.bad} incorrect/unusable timestamps retained in denominator.`]
          : undefined,
    },
    sampleFromRate({
      id: "source_coverage",
      successes: covered,
      attempts: configuredSources,
      windowStart: ws,
      windowEnd: we,
    }),
    sampleFromRate({
      id: "browser_stream_success",
      successes: streamOk,
      attempts: streamN,
      windowStart: ws,
      windowEnd: we,
      notes:
        streamN === 0
          ? ["No browser-stream handshake counters yet."]
          : undefined,
    }),
  ];

  const sourceNotices = sourceDegradationNotices(
    sourceRows,
    targets.providerConnectionMin
  );

  const live = buildLiveConnectionStatus({
    feedOk: feedFresh === 1,
    feedSamples: 1,
    streamSuccessRate: streamN > 0 ? streamOk / streamN : null,
    streamSamples: streamN,
    alertDeliveryRate: alertAttempts > 0 ? alertOk / alertAttempts : null,
    alertSamples: alertAttempts,
  });

  return { samples, sourceNotices, live };
}

export async function getReliabilityDashboard(hours = 24): Promise<{
  targets: ReturnType<typeof getServiceTargets>;
  indicators: IndicatorResult[];
  sourceNotices: SourceDegradationNotice[];
  live: LiveConnectionStatus;
  publicLatency: ReturnType<typeof aggregatePublicLatency>;
  disclaimer: string;
  legalPlaceholder: string;
}> {
  const targets = getServiceTargets();
  const { samples, sourceNotices, live } = await collectIndicatorSamples(hours);
  const indicators = evaluateAllIndicators(samples, targets);

  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const traces = await prisma.latencyTrace.findMany({
    where: { createdAt: { gte: windowStart } },
    select: {
      processingLatencyMs: true,
      fetchLatencyMs: true,
      totalLatencyMs: true,
    },
    take: 5_000,
  });

  const publicLatency = aggregatePublicLatency({
    windowHours: hours,
    processingMs: traces.map((t) => t.processingLatencyMs),
    upstreamMs: traces.map((t) => t.fetchLatencyMs),
    totalMs: traces.map((t) => t.totalLatencyMs),
    minSamples: 20,
  });

  return {
    targets,
    indicators,
    sourceNotices,
    live,
    publicLatency,
    disclaimer: RELIABILITY_DISCLAIMER,
    legalPlaceholder: STATUS_PAGE_LEGAL_PLACEHOLDER,
  };
}

export async function loadIncidentsFromDb(): Promise<ServiceIncidentRecord[]> {
  const rows = await prisma.serviceIncident.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
  });
  return buildIncidentTimeline(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      severity: r.severity as ServiceIncidentRecord["severity"],
      status: r.status as ServiceIncidentRecord["status"],
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      announcedMaintenance: r.announcedMaintenance,
      announcedAt: r.announcedAt?.toISOString() ?? null,
      components: r.components as ServiceIncidentRecord["components"],
      sources: r.sources,
      evidence: ((r.evidenceJson as unknown) as ServiceIncidentRecord["evidence"]) ?? [],
      affectedSubscriberCount: r.affectedSubscriberCount,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  );
}

export async function getMonthlyReport(
  month: string
): Promise<MonthlyReliabilityReport> {
  const { samples, sourceNotices } = await collectIndicatorSamples(24 * 31);
  const incidents = await loadIncidentsFromDb().catch(() => []);
  return buildMonthlyReliabilityReport({
    month,
    samples,
    incidents,
    sourceNotices,
  });
}
