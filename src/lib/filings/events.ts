/**
 * Map material section diffs → CompanyEvents.
 * Label: "Risk Factors section changed" — never invent specific financial risk.
 */

import type { ClassifiedCompanyEvent } from "../company-events/classify.ts";
import { filingEventFingerprint } from "../company-events/types.ts";
import type { FilingSectionKey, SectionDiffResult } from "./types.ts";

export function mapSectionDiffToEvent(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber: string;
  formType: string;
  sourceUrl?: string | null;
  priorSourceUrl?: string | null;
  priorAccession?: string | null;
  filingDate: Date;
  catalystId?: string | null;
  diff: SectionDiffResult;
}): ClassifiedCompanyEvent | null {
  if (!opts.diff.material) return null;
  if (
    opts.diff.status === "unchanged" ||
    opts.diff.status === "formatting_only" ||
    opts.diff.status === "missing_current"
  ) {
    return null;
  }

  const title = eventTitle(opts.diff.sectionKey, opts.diff.sectionTitle);
  const summary = [
    `${opts.diff.sectionTitle} text changed versus the previous comparable ${opts.formType.replace(/\/A$/i, "")} filing.`,
    `Additions: ${opts.diff.added.length}; removals: ${opts.diff.removed.length}; changed paragraphs: ${opts.diff.changed.length}.`,
    "Wording changes only — not a determination of specific financial risk unless separately extracted.",
  ].join(" ");

  return {
    symbol: opts.symbol.trim().toUpperCase(),
    cik: opts.cik ?? null,
    category: "filing",
    eventType: "filing_section_change",
    severity: "notable",
    title,
    summary,
    occurredAt: opts.filingDate,
    sourceType: "sec",
    sourceId: opts.accessionNumber,
    sourceUrl: opts.sourceUrl ?? null,
    evidenceJson: {
      sectionKey: opts.diff.sectionKey,
      sectionTitle: opts.diff.sectionTitle,
      status: opts.diff.status,
      stats: opts.diff.stats,
      priorAccession: opts.priorAccession ?? null,
      priorSourceUrl: opts.priorSourceUrl ?? null,
      formType: opts.formType,
      engine: "filings",
    },
    fingerprint: filingEventFingerprint({
      symbol: opts.symbol,
      eventType: "filing_section_change",
      accession: opts.accessionNumber,
      discriminant: opts.diff.sectionKey,
    }),
    catalystId: opts.catalystId ?? null,
    dilutionInstrumentId: null,
    confidence: 0.75,
  };
}

function eventTitle(key: FilingSectionKey, label: string): string {
  switch (key) {
    case "risk_factors":
      return "Risk Factors section changed";
    case "mda":
      return "MD&A section changed";
    case "liquidity":
      return "Liquidity / Capital Resources section changed";
    default:
      return `${label} section changed`;
  }
}
