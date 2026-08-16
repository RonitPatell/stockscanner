/**
 * Persist ClassifiedCompanyEvent rows — idempotent upsert on fingerprint.
 * Applies deterministic significance scoring into evidenceJson + severity.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { ClassifiedCompanyEvent } from "./classify.ts";
import {
  scoreEventSignificance,
  significanceToLegacySeverity,
} from "./significance.ts";

function withSignificance(ev: ClassifiedCompanyEvent): {
  severity: string;
  evidenceJson: Record<string, unknown>;
} {
  const significance = scoreEventSignificance({
    eventType: ev.eventType,
    category: ev.category,
    title: ev.title,
    summary: ev.summary,
    evidenceJson: ev.evidenceJson,
    confidence: ev.confidence,
  });

  return {
    severity: significanceToLegacySeverity(significance.level),
    evidenceJson: {
      ...ev.evidenceJson,
      significance: {
        level: significance.level,
        reasonCodes: significance.reasonCodes,
        evidence: significance.evidence,
        engineVersion: significance.engineVersion,
        thesisRelevance: significance.thesisRelevance,
      },
    },
  };
}

export async function persistCompanyEvents(
  events: ClassifiedCompanyEvent[]
): Promise<{ upserted: number; ids: string[] }> {
  const ids: string[] = [];
  let upserted = 0;

  for (const ev of events) {
    const scored = withSignificance(ev);
    const row = await prisma.companyEvent.upsert({
      where: { fingerprint: ev.fingerprint },
      create: {
        symbol: ev.symbol,
        cik: ev.cik,
        category: ev.category,
        eventType: ev.eventType,
        severity: scored.severity,
        title: ev.title,
        summary: ev.summary,
        occurredAt: ev.occurredAt,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        sourceUrl: ev.sourceUrl,
        evidenceJson: scored.evidenceJson as Prisma.InputJsonValue,
        fingerprint: ev.fingerprint,
        catalystId: ev.catalystId,
        dilutionInstrumentId: ev.dilutionInstrumentId,
      },
      update: {
        // Safe reprocess: refresh evidence / links; do not invent new facts.
        title: ev.title,
        summary: ev.summary,
        severity: scored.severity,
        sourceUrl: ev.sourceUrl ?? undefined,
        sourceId: ev.sourceId ?? undefined,
        evidenceJson: scored.evidenceJson as Prisma.InputJsonValue,
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
