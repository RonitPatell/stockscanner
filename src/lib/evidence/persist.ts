/**
 * Persist EvidenceRecord rows — idempotent upsert on fingerprint.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { EvidenceRecordDto, EvidenceRecordInput } from "./types.ts";
import {
  isEvidenceAvailability,
  isEvidenceCategory,
  type EvidenceAvailability,
  type EvidenceCategory,
  type EvidenceLinkedModel,
} from "./types.ts";

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d.getTime();
  return Number.isNaN(t) ? null : d.toISOString();
}

function parseLinkedModel(v: string | null): EvidenceLinkedModel | null {
  if (!v) return null;
  const allowed = [
    "metric_observation",
    "insider_transaction",
    "company_event",
    "filing_section_snapshot",
    "dilution_instrument",
    "capital_risk_snapshot",
    "beneficial_ownership_filing",
    "institutional_holding_snapshot",
    "external_payload",
  ] as const;
  return (allowed as readonly string[]).includes(v)
    ? (v as EvidenceLinkedModel)
    : null;
}

export function mapEvidenceRow(row: {
  id: string;
  symbol: string;
  cik: string | null;
  category: string;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  occurredAt: Date | null;
  reportedAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  linkedModel: string | null;
  linkedId: string | null;
  payloadJson: unknown;
  availability: string;
  fingerprint: string;
  ingestedAt: Date;
}): EvidenceRecordDto {
  const category = isEvidenceCategory(row.category)
    ? row.category
    : ("company_event" as EvidenceCategory);
  const availability = isEvidenceAvailability(row.availability)
    ? row.availability
    : ("reported" as EvidenceAvailability);
  const payload =
    row.payloadJson &&
    typeof row.payloadJson === "object" &&
    !Array.isArray(row.payloadJson)
      ? (row.payloadJson as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    symbol: row.symbol,
    cik: row.cik,
    category,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    occurredAt: toIso(row.occurredAt),
    reportedAt: toIso(row.reportedAt),
    periodStart: toIso(row.periodStart),
    periodEnd: toIso(row.periodEnd),
    linkedModel: parseLinkedModel(row.linkedModel),
    linkedId: row.linkedId,
    payload,
    availability,
    fingerprint: row.fingerprint,
    ingestedAt: row.ingestedAt.toISOString(),
  };
}

export async function upsertEvidenceRecord(
  input: EvidenceRecordInput
): Promise<EvidenceRecordDto> {
  const symbol = input.symbol.trim().toUpperCase();
  const saved = await prisma.evidenceRecord.upsert({
    where: { fingerprint: input.fingerprint },
    create: {
      symbol,
      cik: input.cik ?? null,
      category: input.category,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      occurredAt: input.occurredAt ?? null,
      reportedAt: input.reportedAt ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      linkedModel: input.linkedModel ?? null,
      linkedId: input.linkedId ?? null,
      payloadJson: (input.payload ?? {}) as Prisma.InputJsonValue,
      availability: input.availability ?? "reported",
      fingerprint: input.fingerprint,
    },
    update: {
      sourceUrl: input.sourceUrl ?? undefined,
      reportedAt: input.reportedAt ?? undefined,
      payloadJson: (input.payload ?? {}) as Prisma.InputJsonValue,
      availability: input.availability ?? undefined,
      cik: input.cik ?? undefined,
    },
    select: {
      id: true,
      symbol: true,
      cik: true,
      category: true,
      sourceType: true,
      sourceId: true,
      sourceUrl: true,
      occurredAt: true,
      reportedAt: true,
      periodStart: true,
      periodEnd: true,
      linkedModel: true,
      linkedId: true,
      payloadJson: true,
      availability: true,
      fingerprint: true,
      ingestedAt: true,
    },
  });
  return mapEvidenceRow(saved);
}

export async function listEvidenceForSymbol(opts: {
  symbol: string;
  category?: EvidenceCategory;
  limit?: number;
}): Promise<EvidenceRecordDto[]> {
  const symbol = opts.symbol.trim().toUpperCase();
  const rows = await prisma.evidenceRecord.findMany({
    where: {
      symbol,
      ...(opts.category ? { category: opts.category } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { ingestedAt: "desc" }],
    take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
    select: {
      id: true,
      symbol: true,
      cik: true,
      category: true,
      sourceType: true,
      sourceId: true,
      sourceUrl: true,
      occurredAt: true,
      reportedAt: true,
      periodStart: true,
      periodEnd: true,
      linkedModel: true,
      linkedId: true,
      payloadJson: true,
      availability: true,
      fingerprint: true,
      ingestedAt: true,
    },
  });
  return rows.map(mapEvidenceRow);
}
