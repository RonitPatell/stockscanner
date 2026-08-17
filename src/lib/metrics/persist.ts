/**
 * Persist normalized metric observations — idempotent upsert on fingerprint.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { NormalizedMetricObservation } from "./types.ts";

export async function persistMetricObservations(
  rows: NormalizedMetricObservation[]
): Promise<{ upserted: number; ids: string[] }> {
  const ids: string[] = [];
  let upserted = 0;

  for (const row of rows) {
    const evidence = {
      ...row.evidence,
      normalizedMetricKey: row.metricKey,
      secConcept: row.secConcept,
    };
    const saved = await prisma.metricObservation.upsert({
      where: { fingerprint: row.fingerprint },
      create: {
        symbol: row.symbol,
        cik: row.cik,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        periodLabel: row.periodLabel,
        fiscalYear: row.fiscalYear,
        fiscalPeriod: row.fiscalPeriod,
        filedAt: row.filedAt,
        accession: row.accession,
        secConcept: row.secConcept,
        metricKey: row.metricKey,
        value: row.value,
        unit: row.unit,
        currency: row.currency,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceUrl: row.sourceUrl,
        confidence: row.confidence,
        evidenceJson: evidence as Prisma.InputJsonValue,
        fingerprint: row.fingerprint,
      },
      update: {
        value: row.value,
        unit: row.unit,
        currency: row.currency,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        periodLabel: row.periodLabel,
        fiscalYear: row.fiscalYear,
        fiscalPeriod: row.fiscalPeriod,
        filedAt: row.filedAt ?? undefined,
        accession: row.accession ?? undefined,
        secConcept: row.secConcept ?? undefined,
        sourceUrl: row.sourceUrl ?? undefined,
        confidence: row.confidence,
        evidenceJson: evidence as Prisma.InputJsonValue,
        cik: row.cik ?? undefined,
      },
      select: { id: true },
    });
    ids.push(saved.id);
    upserted += 1;
  }

  if (upserted > 0) {
    const symbols = [
      ...new Set(rows.map((r) => r.symbol.trim().toUpperCase()).filter(Boolean)),
    ];
    void import("../thesis/health/schedule.ts")
      .then(({ scheduleThesisHealthForSymbol }) => {
        for (const sym of symbols) {
          scheduleThesisHealthForSymbol(sym, "metric_observation");
        }
      })
      .catch(() => {});
  }

  return { upserted, ids };
}
