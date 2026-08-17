/**
 * Build EvidenceRecord references from CompanyEvent rows.
 */

import type { EvidenceRecordInput } from "./types.ts";
import { evidenceFingerprint } from "./fingerprint.ts";

export type CompanyEventRef = {
  id: string;
  symbol: string;
  cik: string | null;
  category: string;
  eventType: string;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  occurredAt: Date;
};

const CATEGORY_MAP: Record<string, EvidenceRecordInput["category"]> = {
  filing: "sec_filing",
  financial: "sec_xbrl_fact",
  capital: "capital_financing",
  insider: "form4",
  ownership: "ownership_13d",
  governance: "sec_filing",
  management: "company_event",
};

export function evidenceFromCompanyEvent(row: CompanyEventRef): EvidenceRecordInput {
  const cat = CATEGORY_MAP[row.category] ?? "company_event";
  const fingerprint = evidenceFingerprint({
    symbol: row.symbol,
    category: cat,
    sourceType: row.sourceType,
    linkedModel: "company_event",
    linkedId: row.id,
  });
  return {
    symbol: row.symbol,
    cik: row.cik,
    category: cat,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceUrl: row.sourceUrl,
    occurredAt: row.occurredAt,
    linkedModel: "company_event",
    linkedId: row.id,
    availability: "reported",
    fingerprint,
    payload: {
      eventType: row.eventType,
      companyEventCategory: row.category,
    },
  };
}
