/**
 * Load MetricObservation rows for Quarterly Delta.
 */

import { prisma } from "../prisma.ts";
import type {
  FinancialMetricKey,
  MetricConfidence,
  NormalizedMetricObservation,
} from "./types.ts";
import { FINANCIAL_METRIC_KEYS } from "./types.ts";
import { QUARTERLY_DELTA_SPECS } from "./quarterly-delta.ts";

const DELTA_KEYS = new Set(
  QUARTERLY_DELTA_SPECS.map((s) => s.key)
);

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export async function loadMetricObservationsForSymbol(
  symbol: string
): Promise<NormalizedMetricObservation[]> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.metricObservation.findMany({
    where: {
      symbol: sym,
      metricKey: { in: [...DELTA_KEYS] },
    },
    orderBy: [{ periodEnd: "desc" }, { filedAt: "desc" }],
    take: 500,
  });

  return rows
    .filter((r) =>
      (FINANCIAL_METRIC_KEYS as readonly string[]).includes(r.metricKey)
    )
    .map((r) => ({
      symbol: r.symbol,
      cik: r.cik,
      metricKey: r.metricKey as FinancialMetricKey,
      value: r.value,
      unit: r.unit,
      currency: r.currency,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      periodLabel: r.periodLabel,
      fiscalYear: r.fiscalYear,
      fiscalPeriod: r.fiscalPeriod,
      filedAt: r.filedAt,
      accession: r.accession,
      secConcept: r.secConcept,
      sourceType:
        r.sourceType === "derived" ? "derived" : "sec_companyfacts",
      sourceId: r.sourceId,
      sourceUrl: r.sourceUrl,
      confidence: (r.confidence as MetricConfidence) || "unknown",
      evidence: asRecord(r.evidenceJson),
      fingerprint: r.fingerprint,
    }));
}
