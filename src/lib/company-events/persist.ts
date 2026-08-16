/**
 * Persist ClassifiedCompanyEvent rows — idempotent upsert on fingerprint.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { ClassifiedCompanyEvent } from "./classify.ts";

export async function persistCompanyEvents(
  events: ClassifiedCompanyEvent[]
): Promise<{ upserted: number; ids: string[] }> {
  const ids: string[] = [];
  let upserted = 0;

  for (const ev of events) {
    const row = await prisma.companyEvent.upsert({
      where: { fingerprint: ev.fingerprint },
      create: {
        symbol: ev.symbol,
        cik: ev.cik,
        category: ev.category,
        eventType: ev.eventType,
        severity: ev.severity,
        title: ev.title,
        summary: ev.summary,
        occurredAt: ev.occurredAt,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        sourceUrl: ev.sourceUrl,
        evidenceJson: ev.evidenceJson as Prisma.InputJsonValue,
        fingerprint: ev.fingerprint,
        catalystId: ev.catalystId,
        dilutionInstrumentId: ev.dilutionInstrumentId,
      },
      update: {
        // Safe reprocess: refresh evidence / links; do not invent new facts.
        title: ev.title,
        summary: ev.summary,
        severity: ev.severity,
        sourceUrl: ev.sourceUrl ?? undefined,
        sourceId: ev.sourceId ?? undefined,
        evidenceJson: ev.evidenceJson as Prisma.InputJsonValue,
        catalystId: ev.catalystId ?? undefined,
        dilutionInstrumentId: ev.dilutionInstrumentId ?? undefined,
        occurredAt: ev.occurredAt,
      },
    });
    ids.push(row.id);
    upserted += 1;
  }

  return { upserted, ids };
}
