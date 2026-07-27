import { prisma } from "../prisma.ts";
import { INSTRUMENT_LABELS, type DilutionInstrumentType } from "./types.ts";

export interface DilutionTimelineEvent {
  id: string;
  at: string;
  symbol: string;
  instrumentType: DilutionInstrumentType | string;
  label: string;
  status: string;
  capacityKind: string;
  estimateLabel: string;
  potentialDilutionPct: number | null;
  maxShares: number | null;
  maxDollars: number | null;
  offerPrice: number | null;
  confidence: number;
  sourceUrl: string | null;
  accessionNumber: string | null;
  evidenceSnippets: string[];
  missingFields: string[];
  needsManualReview: boolean;
  conflictNote: string | null;
  /** Honest distinction for traders */
  capacityNote: string;
}

function capacityNote(kind: string, estimateLabel: string): string {
  switch (kind) {
    case "registration_capacity":
      return "Registration capacity — not a confirmed sale.";
    case "atm_availability":
      return "ATM availability — capacity to sell over time, not confirmed issuance.";
    case "announced_sale":
      return "Announced sale / pricing — still verify settlement.";
    case "confirmed_issuance":
      return "Filing language suggests confirmed issuance/sales.";
    default:
      return estimateLabel === "unavailable"
        ? "Terms incomplete — dilution % not calculated."
        : "See evidence; treat figures as labeled estimates only.";
  }
}

/** Chronological capital-risk timeline for a ticker. */
export async function getDilutionTimeline(
  symbol: string,
  limit = 50
): Promise<DilutionTimelineEvent[]> {
  const rows = await prisma.dilutionInstrument.findMany({
    where: { symbol: symbol.toUpperCase() },
    orderBy: [{ filingDate: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    at: (r.filingDate ?? r.createdAt).toISOString(),
    symbol: r.symbol,
    instrumentType: r.instrumentType,
    label:
      INSTRUMENT_LABELS[r.instrumentType as DilutionInstrumentType] ||
      r.instrumentType,
    status: r.status,
    capacityKind: r.capacityKind,
    estimateLabel: r.estimateLabel,
    potentialDilutionPct: r.potentialDilutionPct,
    maxShares: r.maxShares,
    maxDollars: r.maxDollars,
    offerPrice: r.offerPrice,
    confidence: r.confidence,
    sourceUrl: r.sourceUrl,
    accessionNumber: r.accessionNumber,
    evidenceSnippets: r.evidenceSnippets,
    missingFields: r.missingFields,
    needsManualReview: r.needsManualReview,
    conflictNote: r.conflictNote,
    capacityNote: capacityNote(r.capacityKind, r.estimateLabel),
  }));
}
