/**
 * Canonical evidence representation for Company Reality OS.
 * References existing persisted rows — does not duplicate SEC facts or filing bodies.
 */

export const EVIDENCE_CATEGORIES = [
  "sec_filing",
  "sec_xbrl_fact",
  "form4",
  "ownership_13d",
  "ownership_13f",
  "capital_financing",
  "capital_snapshot",
  "company_event",
  "filing_section",
  "external_government",
  "external_clinical",
  "external_regulatory",
  "external_other",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_LINKED_MODELS = [
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

export type EvidenceLinkedModel = (typeof EVIDENCE_LINKED_MODELS)[number];

/** Product-safe evidence availability — not an investment rating. */
export const EVIDENCE_AVAILABILITY = [
  "verified",
  "derived",
  "reported",
  "unknown",
] as const;

export type EvidenceAvailability = (typeof EVIDENCE_AVAILABILITY)[number];

export type EvidenceRecordInput = {
  symbol: string;
  cik?: string | null;
  category: EvidenceCategory;
  sourceType: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  occurredAt?: Date | null;
  reportedAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  linkedModel?: EvidenceLinkedModel | null;
  linkedId?: string | null;
  payload?: Record<string, unknown>;
  availability?: EvidenceAvailability;
  fingerprint: string;
};

export type EvidenceRecordDto = {
  id: string;
  symbol: string;
  cik: string | null;
  category: EvidenceCategory;
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  occurredAt: string | null;
  reportedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  linkedModel: EvidenceLinkedModel | null;
  linkedId: string | null;
  payload: Record<string, unknown>;
  availability: EvidenceAvailability;
  fingerprint: string;
  ingestedAt: string;
};

export function isEvidenceCategory(v: string): v is EvidenceCategory {
  return (EVIDENCE_CATEGORIES as readonly string[]).includes(v);
}

export function isEvidenceAvailability(v: string): v is EvidenceAvailability {
  return (EVIDENCE_AVAILABILITY as readonly string[]).includes(v);
}

export function normalizeEvidenceSymbol(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
}
