/**
 * Map dilution instrument extractions → capital CompanyEvents (confidence-gated).
 */

import type { DilutionExtractionResult, DilutionInstrumentType } from "../dilution/types.ts";
import {
  CAPITAL_EVENT_MIN_CONFIDENCE,
  filingEventFingerprint,
  type CompanyEventSeverity,
  type CompanyEventType,
} from "./types.ts";
import type { ClassifiedCompanyEvent } from "./classify.ts";

const INSTRUMENT_EVENT: Partial<
  Record<
    DilutionInstrumentType,
    { eventType: CompanyEventType; severity: CompanyEventSeverity; label: string }
  >
> = {
  S3_SHELF: {
    eventType: "shelf_registration",
    severity: "notable",
    label: "S-3 shelf registration (capacity, not a confirmed sale)",
  },
  S1_REGISTRATION: {
    eventType: "s1_registration",
    severity: "notable",
    label: "S-1 registration (capacity, not a confirmed sale)",
  },
  PROSPECTUS_424B5: {
    eventType: "prospectus_424b5",
    severity: "notable",
    label: "424B5 prospectus supplement",
  },
  ATM_PROGRAM: {
    eventType: "atm_program",
    severity: "material",
    label: "At-the-market (ATM) program",
  },
  REGISTERED_DIRECT: {
    eventType: "registered_direct",
    severity: "material",
    label: "Registered direct offering",
  },
  CONVERTIBLE_NOTE: {
    eventType: "convertible_instrument",
    severity: "material",
    label: "Convertible note",
  },
  CONVERTIBLE_PREFERRED: {
    eventType: "convertible_instrument",
    severity: "material",
    label: "Convertible preferred",
  },
  WARRANT: {
    eventType: "warrant_issuance",
    severity: "notable",
    label: "Warrants",
  },
  WARRANT_REPRICE: {
    eventType: "warrant_reprice",
    severity: "notable",
    label: "Warrant reprice",
  },
  REVERSE_SPLIT: {
    eventType: "reverse_split",
    severity: "material",
    label: "Reverse split",
  },
  EFFECTIVE_REGISTRATION: {
    eventType: "effective_registration",
    severity: "notable",
    label: "Effective registration notice",
  },
  SHARES_OUTSTANDING_CHANGE: {
    eventType: "share_issuance",
    severity: "notable",
    label: "Shares outstanding change",
  },
};

export function mapDilutionToCompanyEvents(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber?: string | null;
  rawNewsId?: string | null;
  sourceUrl?: string | null;
  publishedAt?: Date | string | null;
  catalystId?: string | null;
  formType?: string | null;
  extracted: DilutionExtractionResult[];
  /** Parallel dilutionInstrument ids from persist (same order when available). */
  instrumentIds?: string[];
}): ClassifiedCompanyEvent[] {
  const symbol = opts.symbol.trim().toUpperCase();
  const occurredAt =
    opts.publishedAt instanceof Date
      ? opts.publishedAt
      : opts.publishedAt
        ? new Date(opts.publishedAt)
        : new Date();
  const sourceId =
    opts.accessionNumber?.trim() || opts.rawNewsId?.trim() || null;

  const out: ClassifiedCompanyEvent[] = [];

  opts.extracted.forEach((ex, i) => {
    if (ex.confidence < CAPITAL_EVENT_MIN_CONFIDENCE) return;
    const mapped = INSTRUMENT_EVENT[ex.instrumentType];
    if (!mapped) return;

    // Skip low-evidence amendments / terminated without clear type mapping
    if (ex.needsManualReview && ex.confidence < 0.7) return;

    const discriminant = `capital:${ex.instrumentType}`.toLowerCase();
    out.push({
      symbol,
      cik: opts.cik ?? null,
      category: "capital",
      eventType: mapped.eventType,
      severity: mapped.severity,
      title: mapped.label,
      summary:
        ex.evidenceSnippets[0]?.slice(0, 500) ??
        `${mapped.label} detected from SEC filing evidence.`,
      occurredAt: Number.isFinite(occurredAt.getTime()) ? occurredAt : new Date(),
      sourceType: "sec",
      sourceId,
      sourceUrl: opts.sourceUrl ?? null,
      evidenceJson: {
        formType: opts.formType ?? null,
        accessionNumber: opts.accessionNumber ?? null,
        instrumentType: ex.instrumentType,
        confidence: ex.confidence,
        estimateLabel: ex.estimateLabel,
        capacityKind: ex.capacityKind,
        evidenceSnippets: ex.evidenceSnippets.slice(0, 5),
        maxShares: ex.maxShares,
        maxDollars: ex.maxDollars,
        match: "dilution_extraction",
        note:
          ex.estimateLabel === "capacity_only"
            ? "Registration capacity — not a confirmed sale"
            : undefined,
      },
      fingerprint: filingEventFingerprint({
        symbol,
        eventType: mapped.eventType,
        accession: opts.accessionNumber,
        rawNewsId: opts.rawNewsId,
        discriminant,
      }),
      catalystId: opts.catalystId ?? null,
      dilutionInstrumentId: opts.instrumentIds?.[i] ?? null,
      confidence: ex.confidence,
    });
  });

  return out;
}
