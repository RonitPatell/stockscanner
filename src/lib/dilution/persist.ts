import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import {
  extractDilutionInstruments,
  parseAccessionFromUrl,
  parseFormFromRawNewsId,
} from "./extract.ts";
import type { DilutionExtractionInput, DilutionExtractionResult } from "./types.ts";

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function persistDilutionExtractions(
  input: DilutionExtractionInput,
  extracted: DilutionExtractionResult[]
): Promise<string[]> {
  const ids: string[] = [];
  const accession =
    input.accessionNumber || parseAccessionFromUrl(input.sourceUrl) || null;
  const formType =
    input.formType || parseFormFromRawNewsId(input.rawNewsId) || null;

  for (const ex of extracted) {
    const keyAccession = accession || `no-acc-${input.rawNewsId || input.title.slice(0, 40)}`;
    const row = await prisma.dilutionInstrument.upsert({
      where: {
        symbol_accessionNumber_instrumentType: {
          symbol: input.symbol.toUpperCase(),
          accessionNumber: keyAccession,
          instrumentType: ex.instrumentType,
        },
      },
      create: {
        symbol: input.symbol.toUpperCase(),
        cik: input.cik ?? null,
        instrumentType: ex.instrumentType,
        status: ex.status,
        accessionNumber: keyAccession,
        sourceUrl: input.sourceUrl ?? null,
        formType,
        filingDate: toDate(input.filingDate),
        effectiveDate: toDate(input.effectiveDate),
        maxShares: ex.maxShares,
        maxDollars: ex.maxDollars,
        offerPrice: ex.offerPrice,
        warrantCount: ex.warrantCount,
        warrantExercisePrice: ex.warrantExercisePrice,
        potentialDilutionPct: ex.potentialDilutionPct,
        estimateLabel: ex.estimateLabel,
        capacityKind: ex.capacityKind,
        confidence: ex.confidence,
        missingFields: ex.missingFields,
        evidenceSnippets: ex.evidenceSnippets,
        structuredSections: ex.structuredSections as Prisma.InputJsonValue,
        sharesOutstandingDenom: ex.sharesOutstandingDenom,
        catalystId: input.catalystId ?? null,
        rawNewsId: input.rawNewsId ?? null,
        needsManualReview: ex.needsManualReview,
        conflictNote: ex.conflictHint ?? null,
      },
      update: {
        status: ex.status,
        sourceUrl: input.sourceUrl ?? undefined,
        formType: formType ?? undefined,
        filingDate: toDate(input.filingDate) ?? undefined,
        effectiveDate: toDate(input.effectiveDate) ?? undefined,
        maxShares: ex.maxShares,
        maxDollars: ex.maxDollars,
        offerPrice: ex.offerPrice,
        warrantCount: ex.warrantCount,
        warrantExercisePrice: ex.warrantExercisePrice,
        potentialDilutionPct: ex.potentialDilutionPct,
        estimateLabel: ex.estimateLabel,
        capacityKind: ex.capacityKind,
        confidence: ex.confidence,
        missingFields: ex.missingFields,
        evidenceSnippets: ex.evidenceSnippets,
        structuredSections: ex.structuredSections as Prisma.InputJsonValue,
        sharesOutstandingDenom: ex.sharesOutstandingDenom,
        catalystId: input.catalystId ?? undefined,
        needsManualReview: ex.needsManualReview,
        conflictNote: ex.conflictHint ?? undefined,
      },
    });
    ids.push(row.id);
  }

  await flagConflicts(input.symbol.toUpperCase()).catch(() => {});
  return ids;
}

/** Detect conflicting active instruments of incompatible kinds. */
export async function flagConflicts(symbol: string): Promise<number> {
  const rows = await prisma.dilutionInstrument.findMany({
    where: {
      symbol,
      status: { in: ["active", "unknown"] },
    },
    orderBy: { filingDate: "desc" },
    take: 40,
  });

  let created = 0;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      // Same type, overlapping capacity, different accessions
      if (
        a.instrumentType === b.instrumentType &&
        a.accessionNumber &&
        b.accessionNumber &&
        a.accessionNumber !== b.accessionNumber &&
        a.status === "active" &&
        b.status === "terminated"
      ) {
        const reason = `${a.instrumentType}: active filing vs terminated facility`;
        const exists = await prisma.dilutionConflict.findFirst({
          where: {
            symbol,
            OR: [
              { instrumentIdA: a.id, instrumentIdB: b.id },
              { instrumentIdA: b.id, instrumentIdB: a.id },
            ],
            resolved: false,
          },
        });
        if (!exists) {
          await prisma.dilutionConflict.create({
            data: {
              symbol,
              instrumentIdA: a.id,
              instrumentIdB: b.id,
              reason,
            },
          });
          await prisma.dilutionInstrument.update({
            where: { id: a.id },
            data: { needsManualReview: true, conflictNote: reason },
          });
          created++;
        }
      }
      // ATM availability vs confirmed issuance same week with wildly different sizes
      if (
        a.instrumentType === "ATM_PROGRAM" &&
        b.instrumentType === "ATM_PROGRAM" &&
        a.maxDollars &&
        b.maxDollars &&
        Math.abs(a.maxDollars - b.maxDollars) / Math.max(a.maxDollars, b.maxDollars) > 0.5
      ) {
        const reason = "Conflicting ATM capacity sizes across filings";
        const exists = await prisma.dilutionConflict.findFirst({
          where: {
            symbol,
            reason,
            resolved: false,
          },
        });
        if (!exists) {
          await prisma.dilutionConflict.create({
            data: {
              symbol,
              instrumentIdA: a.id,
              instrumentIdB: b.id,
              reason,
            },
          });
          created++;
        }
      }
    }
  }
  return created;
}

export async function processFilingForDilution(
  input: DilutionExtractionInput
): Promise<{ extracted: number; ids: string[] }> {
  const extracted = extractDilutionInstruments(input);
  if (extracted.length === 0) return { extracted: 0, ids: [] };
  const ids = await persistDilutionExtractions(input, extracted);
  return { extracted: extracted.length, ids };
}
