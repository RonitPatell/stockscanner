import { prisma } from "../prisma.ts";
import { buildCalibrationReport, publicCalibrationSummary } from "./report.ts";
import type { OutcomeRowForReport } from "./report.ts";
import {
  CALIBRATION_DISCLAIMER,
  PRIMARY_HORIZON,
  type CalibrationReport,
} from "./types.ts";
import { EDGE_NOTIONAL_USD } from "../speed-edge.ts";

export async function loadOutcomeRowsForReport(hours = 168): Promise<OutcomeRowForReport[]> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.catalystOutcome.findMany({
    where: { createdAt: { gte: since }, rawReturnPct: { not: null } },
    select: {
      catalystType: true,
      sourceTier: true,
      strength: true,
      confidenceBucket: true,
      floatBucket: true,
      liquidityBucket: true,
      marketSession: true,
      eligibleUrgent: true,
      rawReturnPct: true,
      spyRelativePct: true,
      metrics: true,
    },
    take: 2000,
  });

  return rows.map((r) => ({
    catalystType: r.catalystType,
    sourceTier: r.sourceTier,
    strength: r.strength,
    confidenceBucket: r.confidenceBucket,
    floatBucket: r.floatBucket,
    liquidityBucket: r.liquidityBucket,
    marketSession: r.marketSession,
    eligibleUrgent: r.eligibleUrgent,
    rawReturnPct: r.rawReturnPct,
    spyRelativePct: r.spyRelativePct,
    directionHit: null,
  }));
}

export async function getCalibrationReport(opts?: {
  hours?: number;
  publicOnly?: boolean;
}): Promise<CalibrationReport> {
  const rows = await loadOutcomeRowsForReport(opts?.hours ?? 168);
  const report = buildCalibrationReport(rows);
  return opts?.publicOnly ? publicCalibrationSummary(report) : report;
}

/** Dashboard summary — reaction stats first, not dollar P&L. */
export interface CalibrationDashboardSummary {
  version: "calibration-v1";
  generatedAt: string;
  primaryHorizon: typeof PRIMARY_HORIZON;
  sampleSize: number;
  eligibleUrgent: number;
  medianAbsReturnPct: number | null;
  meanAbsReturnPct: number | null;
  reactionRate: number | null;
  precision: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  insufficientSample: boolean;
  meanSpyRelativePct: number | null;
  bySession: Array<{
    session: string;
    n: number;
    medianAbsReturnPct: number | null;
  }>;
  disclaimer: string;
  /** Optional illustrative notional — off by default in UI */
  illustrativeNotionalUsd: number;
  illustrativeReactionUsd: number | null;
}

export async function getCalibrationDashboardSummary(
  hours = 24
): Promise<CalibrationDashboardSummary> {
  const report = await getCalibrationReport({ hours, publicOnly: false });
  const overall = report.cohorts.find((c) => c.dimension === "overall") ?? report.cohorts[0];
  const sessions = report.cohorts
    .filter((c) => c.dimension === "marketSession")
    .map((c) => ({
      session: c.value,
      n: c.n,
      medianAbsReturnPct: c.medianAbsReturnPct,
    }));

  const medianAbs = overall?.medianAbsReturnPct ?? null;
  const illustrativeReactionUsd =
    medianAbs != null
      ? Math.round((medianAbs / 100) * EDGE_NOTIONAL_USD * 100) / 100
      : null;

  return {
    version: "calibration-v1",
    generatedAt: report.generatedAt,
    primaryHorizon: PRIMARY_HORIZON,
    sampleSize: overall?.n ?? 0,
    eligibleUrgent: report.eligibleUrgent,
    medianAbsReturnPct: medianAbs,
    meanAbsReturnPct: overall?.meanAbsReturnPct ?? null,
    reactionRate: overall?.reactionRate ?? null,
    precision: overall?.precision ?? null,
    ciLow: overall?.ciLow ?? null,
    ciHigh: overall?.ciHigh ?? null,
    insufficientSample: overall?.insufficientSample ?? true,
    meanSpyRelativePct: overall?.meanSpyRelativePct ?? null,
    bySession: sessions,
    disclaimer: CALIBRATION_DISCLAIMER,
    illustrativeNotionalUsd: EDGE_NOTIONAL_USD,
    illustrativeReactionUsd,
  };
}

export interface PublicCaseStudy {
  id: string;
  kind: "demo" | "outcome";
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  catalystType: string | null;
  priceAtIngest: number | null;
  priceLater: number | null;
  rawReturnPct: number | null;
  checkpointLabel: string;
  whatHappened: string;
  evidence: string[];
  disclaimer: string;
}

/**
 * Public case studies — DemoCase approved OR CatalystOutcome.approvedCaseStudy.
 */
export async function getPublicCaseStudies(limit = 24): Promise<PublicCaseStudy[]> {
  const [demos, outcomes] = await Promise.all([
    prisma.demoCase.findMany({
      where: { approved: true },
      orderBy: { publishedAt: "desc" },
      take: limit,
    }),
    prisma.catalystOutcome.findMany({
      where: { approvedCaseStudy: true, rawReturnPct: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const fromDemo: PublicCaseStudy[] = demos.map((d) => ({
    id: d.id,
    kind: "demo" as const,
    symbol: d.symbol,
    headline: d.headline,
    source: d.source,
    sourceUrl: d.sourceUrl,
    publishedAt: d.publishedAt.toISOString(),
    catalystType: d.catalystType,
    priceAtIngest: d.priceAtIngest,
    priceLater: d.priceLater,
    rawReturnPct: d.changeLater,
    checkpointLabel: d.laterCheckpointLabel || "later",
    whatHappened: d.whatHappened,
    evidence: d.evidence,
    disclaimer: CALIBRATION_DISCLAIMER,
  }));

  const catalystIds = outcomes.map((o) => o.catalystId);
  const catalysts =
    catalystIds.length > 0
      ? await prisma.catalyst.findMany({
          where: { id: { in: catalystIds } },
          select: {
            id: true,
            headline: true,
            source: true,
            sourceUrl: true,
            publishedAt: true,
          },
        })
      : [];
  const byId = new Map(catalysts.map((c) => [c.id, c]));

  const fromOutcome: PublicCaseStudy[] = outcomes.map((o) => {
    const c = byId.get(o.catalystId);
    const snaps = (o.snapshots ?? {}) as Record<
      string,
      { price?: number | null }
    >;
    return {
      id: o.id,
      kind: "outcome" as const,
      symbol: o.symbol,
      headline: c?.headline ?? `${o.symbol} catalyst`,
      source: c?.source ?? "TrustTicker",
      sourceUrl: c?.sourceUrl ?? null,
      publishedAt: (c?.publishedAt ?? o.createdAt).toISOString(),
      catalystType: o.catalystType,
      priceAtIngest: snaps.ingest?.price ?? null,
      priceLater: snaps.m15?.price ?? snaps.m5?.price ?? null,
      rawReturnPct: o.rawReturnPct,
      checkpointLabel: "+15m",
      whatHappened:
        o.caseStudyNote ||
        `Observed ${o.rawReturnPct?.toFixed(2)}% raw return at +15m` +
          (o.spyRelativePct != null
            ? ` (${o.spyRelativePct.toFixed(2)}% vs SPY)`
            : ""),
      evidence: [
        o.spyRelativePct != null ? `SPY-relative ${o.spyRelativePct.toFixed(2)}%` : "",
        o.mfePct != null ? `MFE ${o.mfePct.toFixed(2)}%` : "",
        o.maePct != null ? `MAE ${o.maePct.toFixed(2)}%` : "",
      ].filter(Boolean),
      disclaimer: CALIBRATION_DISCLAIMER,
    };
  });

  return [...fromDemo, ...fromOutcome]
    .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
    .slice(0, limit);
}
