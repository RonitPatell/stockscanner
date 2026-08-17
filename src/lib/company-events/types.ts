/**
 * Strongly typed CompanyEvent categories / types.
 * Prisma stores these as strings; ingest must validate against these unions.
 * Values are factual event labels — never buy/sell recommendations.
 */

export const COMPANY_EVENT_CATEGORIES = [
  "filing",
  "financial",
  "capital",
  "insider",
  "management",
  "governance",
  "ownership",
  "guidance",
  "corporate",
] as const;

export type CompanyEventCategory = (typeof COMPANY_EVENT_CATEGORIES)[number];

export const COMPANY_EVENT_SEVERITIES = [
  "info",
  "notable",
  "material",
  "critical",
  "unknown",
] as const;

export type CompanyEventSeverity = (typeof COMPANY_EVENT_SEVERITIES)[number];

export const COMPANY_EVENT_SOURCE_TYPES = [
  "sec",
  "news",
  "wire",
  "derived",
  "manual",
] as const;

export type CompanyEventSourceType = (typeof COMPANY_EVENT_SOURCE_TYPES)[number];

/**
 * Central event-type registry. Add new types here before ingest writes them.
 * See docs/V2_COMPANY_EVENTS.md for supported SEC forms and confidence rules.
 */
export const COMPANY_EVENT_TYPES = [
  // —— Filings (form-level) ——
  "sec_8k",
  "sec_10k",
  "sec_10q",
  "sec_nt_10k",
  "sec_nt_10q",
  "sec_s1",
  "sec_s1_a",
  "sec_s3",
  "sec_s3_a",
  "sec_424b5",
  "sec_effect",
  "sec_def_14a",
  "sec_form3",
  "sec_form4",
  "sec_form5",
  "sec_form144",
  "sec_13d",
  "sec_13d_a",
  "sec_13g",
  "sec_13g_a",
  "sec_13f",
  "sec_other",
  // —— Material 8-K items (only when reliably identifiable) ——
  "auditor_change",
  "management_change",
  "director_change",
  "material_agreement",
  "bankruptcy_receivership",
  "impairment",
  "financial_results_8k",
  "non_reliance_restatement",
  // —— Financial (structured deltas — separate engines) ——
  "earnings_release",
  "revenue_delta",
  "eps_delta",
  "cash_delta",
  "margin_delta",
  "metric_observation",
  // —— Capital (from dilution extraction when confident) ——
  "shelf_registration",
  "s1_registration",
  "prospectus_424b5",
  "atm_program",
  "registered_direct",
  "convertible_instrument",
  "warrant_issuance",
  "warrant_reprice",
  "share_issuance",
  "reverse_split",
  "effective_registration",
  "offering_priced",
  "dilution_capacity_change",
  "capital_risk_level_change",
  "warrant_exercise_window",
  // —— Insider ——
  "insider_purchase",
  "insider_sale",
  "insider_grant",
  "insider_disposition_other",
  "insider_form4",
  // —— Management / governance ——
  "ceo_change",
  "cfo_change",
  "executive_departure",
  "executive_appointment",
  "board_change",
  "shareholder_meeting",
  "charter_amendment",
  // —— Ownership ——
  "beneficial_ownership_13d",
  "beneficial_ownership_13g",
  "institutional_13f_update",
  // —— Guidance ——
  "guidance_raised",
  "guidance_lowered",
  "guidance_withdrawn",
  "guidance_issued",
  // —— Corporate ——
  "merger_announced",
  "acquisition_announced",
  "spinoff",
  "name_change",
  "ticker_change",
  "bankruptcy",
  "delisting_notice",
  "halt_related",
  "other_material",
] as const;

export type CompanyEventType = (typeof COMPANY_EVENT_TYPES)[number];

/** Minimum dilution extraction confidence to emit a capital CompanyEvent. */
export const CAPITAL_EVENT_MIN_CONFIDENCE = 0.55;

const CATEGORY_SET = new Set<string>(COMPANY_EVENT_CATEGORIES);
const TYPE_SET = new Set<string>(COMPANY_EVENT_TYPES);
const SEVERITY_SET = new Set<string>(COMPANY_EVENT_SEVERITIES);
const SOURCE_SET = new Set<string>(COMPANY_EVENT_SOURCE_TYPES);

export function isCompanyEventCategory(v: string): v is CompanyEventCategory {
  return CATEGORY_SET.has(v);
}

export function isCompanyEventType(v: string): v is CompanyEventType {
  return TYPE_SET.has(v);
}

export function isCompanyEventSeverity(v: string): v is CompanyEventSeverity {
  return SEVERITY_SET.has(v);
}

export function isCompanyEventSourceType(v: string): v is CompanyEventSourceType {
  return SOURCE_SET.has(v);
}

/**
 * Stable fingerprint for SEC / derived events.
 * Prefer accession (or rawNewsId) — do NOT include volatile titles/timestamps
 * so reprocessing the same filing stays idempotent.
 */
export function filingEventFingerprint(parts: {
  symbol: string;
  eventType: string;
  accession?: string | null;
  rawNewsId?: string | null;
  /** Distinguishes multiple events from one filing (e.g. 8-K item key). */
  discriminant?: string | null;
}): string {
  const src = (
    parts.accession?.trim() ||
    parts.rawNewsId?.trim() ||
    "nosrc"
  ).toUpperCase();
  return [
    parts.symbol.trim().toUpperCase(),
    parts.eventType,
    "sec",
    src,
    (parts.discriminant ?? "base").trim().toLowerCase() || "base",
  ].join("|");
}

/** @deprecated Prefer filingEventFingerprint for SEC ingest. */
export function companyEventFingerprint(parts: {
  symbol: string;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  occurredAt: Date | string;
  title?: string | null;
}): string {
  if (parts.sourceType === "sec") {
    return filingEventFingerprint({
      symbol: parts.symbol,
      eventType: parts.eventType,
      accession: parts.sourceId,
      discriminant: parts.title?.slice(0, 40) ?? "base",
    });
  }
  const occurred =
    typeof parts.occurredAt === "string"
      ? parts.occurredAt
      : parts.occurredAt.toISOString();
  const src = (parts.sourceId ?? "").trim().toUpperCase();
  const titleKey = (parts.title ?? "").trim().toLowerCase().slice(0, 120);
  return [
    parts.symbol.trim().toUpperCase(),
    parts.eventType,
    parts.sourceType,
    src || "nosrc",
    occurred,
    titleKey || "notitle",
  ].join("|");
}
