/**
 * Map structured beneficial ownership → CompanyEvents for Watchtower.
 * Copy: "Beneficial owner reported X%" — never "smart money."
 */

import type { ClassifiedCompanyEvent } from "../company-events/classify.ts";
import type { CompanyEventSeverity, CompanyEventType } from "../company-events/types.ts";
import { filingEventFingerprint } from "../company-events/types.ts";
import type { OwnershipStructuredKind } from "./types.ts";

function eventTypeFor(kind: OwnershipStructuredKind): CompanyEventType | null {
  switch (kind) {
    case "material_new":
      return "beneficial_ownership_material_new";
    case "pct_change":
      return "beneficial_ownership_pct_change";
    case "exit_reduction":
      return "beneficial_ownership_exit";
    default:
      return null;
  }
}

function severityFor(kind: OwnershipStructuredKind): CompanyEventSeverity {
  switch (kind) {
    case "material_new":
      return "material";
    case "exit_reduction":
      return "notable";
    case "pct_change":
      return "notable";
    default:
      return "info";
  }
}

export function mapOwnershipToCompanyEvents(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber: string;
  sourceUrl?: string | null;
  filedAt: Date;
  catalystId?: string | null;
  formType: string | null;
  filerName: string;
  percentOwned: number | null;
  sharesOwned: number | null;
  previousPercent: number | null;
  percentChange: number | null;
  structuredKind: OwnershipStructuredKind;
  summaryText: string;
  filingId?: string | null;
}): ClassifiedCompanyEvent[] {
  const eventType = eventTypeFor(opts.structuredKind);
  if (!eventType) return [];

  const sym = opts.symbol.trim().toUpperCase();
  return [
    {
      symbol: sym,
      cik: opts.cik ?? null,
      category: "ownership",
      eventType,
      severity: severityFor(opts.structuredKind),
      title: titleFor(opts.structuredKind, opts.filerName, opts.percentOwned),
      summary: `${opts.summaryText} Informational ownership disclosure — not a trading signal.`,
      occurredAt: opts.filedAt,
      sourceType: "sec",
      sourceId: opts.accessionNumber,
      sourceUrl: opts.sourceUrl ?? null,
      evidenceJson: {
        filerName: opts.filerName,
        formType: opts.formType,
        percentOwned: opts.percentOwned,
        sharesOwned: opts.sharesOwned,
        previousPercent: opts.previousPercent,
        percentChange: opts.percentChange,
        structuredKind: opts.structuredKind,
        beneficialOwnershipFilingId: opts.filingId ?? null,
        engine: "ownership",
      },
      fingerprint: filingEventFingerprint({
        symbol: sym,
        eventType,
        accession: opts.accessionNumber,
        discriminant: opts.structuredKind,
      }),
      catalystId: opts.catalystId ?? null,
      dilutionInstrumentId: null,
      confidence: 0.8,
    },
  ];
}

function titleFor(
  kind: OwnershipStructuredKind,
  filer: string,
  pct: number | null
): string {
  const p =
    pct != null && Number.isFinite(pct)
      ? `${Math.round(pct * 100) / 100}%`
      : "ownership";
  switch (kind) {
    case "material_new":
      return `Beneficial owner reported ${p} — ${filer}`;
    case "pct_change":
      return `Beneficial ownership change to ${p} — ${filer}`;
    case "exit_reduction":
      return `Beneficial ownership reduction to ${p} — ${filer}`;
    default:
      return `Beneficial owner reported ${p} — ${filer}`;
  }
}
