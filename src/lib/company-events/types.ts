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
 * Grouped by category for documentation; runtime validation is flat.
 */
export const COMPANY_EVENT_TYPES = [
  // filing
  "sec_8k",
  "sec_10k",
  "sec_10q",
  "sec_s1",
  "sec_s3",
  "sec_424b",
  "sec_form4",
  "sec_13d",
  "sec_13g",
  "sec_13f",
  "sec_other",
  // financial
  "earnings_release",
  "revenue_delta",
  "eps_delta",
  "cash_delta",
  "margin_delta",
  "metric_observation",
  // capital
  "shelf_registration",
  "atm_program",
  "registered_direct",
  "offering_priced",
  "dilution_capacity_change",
  "warrant_exercise_window",
  // insider
  "insider_purchase",
  "insider_sale",
  "insider_grant",
  "insider_disposition_other",
  "insider_form4",
  // management
  "ceo_change",
  "cfo_change",
  "executive_departure",
  "executive_appointment",
  // governance
  "board_change",
  "auditor_change",
  "shareholder_meeting",
  "charter_amendment",
  // ownership
  "beneficial_ownership_13d",
  "beneficial_ownership_13g",
  "institutional_13f_update",
  // guidance
  "guidance_raised",
  "guidance_lowered",
  "guidance_withdrawn",
  "guidance_issued",
  // corporate
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

/** Build a stable fingerprint for idempotent CompanyEvent upserts. */
export function companyEventFingerprint(parts: {
  symbol: string;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  occurredAt: Date | string;
  title?: string | null;
}): string {
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
