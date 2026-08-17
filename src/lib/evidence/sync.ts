/**
 * Sync EvidenceRecord index from existing persisted facts (idempotent).
 */

import { prisma } from "../prisma.ts";
import { evidenceFromCompanyEvent } from "./from-company-event.ts";
import { evidenceFromMetricObservation } from "./from-metric.ts";
import { upsertEvidenceRecord } from "./persist.ts";
import type { EvidenceRecordDto } from "./types.ts";

export async function syncEvidenceForSymbol(
  symbol: string,
  opts?: { metricLimit?: number; eventLimit?: number }
): Promise<{ upserted: number; ids: string[] }> {
  const sym = symbol.trim().toUpperCase();
  const ids: string[] = [];
  let upserted = 0;

  const metrics = await prisma.metricObservation.findMany({
    where: { symbol: sym },
    orderBy: [{ periodEnd: "desc" }, { filedAt: "desc" }],
    take: Math.min(opts?.metricLimit ?? 100, 500),
    select: {
      id: true,
      symbol: true,
      cik: true,
      metricKey: true,
      value: true,
      unit: true,
      periodEnd: true,
      filedAt: true,
      accession: true,
      secConcept: true,
      sourceType: true,
      sourceUrl: true,
    },
  });

  for (const m of metrics) {
    const dto = await upsertEvidenceRecord(evidenceFromMetricObservation(m));
    ids.push(dto.id);
    upserted += 1;
  }

  const events = await prisma.companyEvent.findMany({
    where: { symbol: sym },
    orderBy: { occurredAt: "desc" },
    take: Math.min(opts?.eventLimit ?? 50, 200),
    select: {
      id: true,
      symbol: true,
      cik: true,
      category: true,
      eventType: true,
      sourceType: true,
      sourceId: true,
      sourceUrl: true,
      occurredAt: true,
    },
  });

  for (const e of events) {
    const dto = await upsertEvidenceRecord(evidenceFromCompanyEvent(e));
    ids.push(dto.id);
    upserted += 1;
  }

  return { upserted, ids };
}

export async function getEvidenceForSymbol(
  symbol: string,
  limit = 50
): Promise<EvidenceRecordDto[]> {
  const { listEvidenceForSymbol } = await import("./persist.ts");
  return listEvidenceForSymbol({ symbol, limit });
}
