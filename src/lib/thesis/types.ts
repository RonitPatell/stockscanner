/**
 * Thesis condition / health types — evaluative labels only, not trade advice.
 */

export const THESIS_STATUSES = ["active", "paused", "archived"] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const THESIS_HEALTH_STATUSES = [
  "healthy",
  "watch",
  "broken",
  "unknown",
] as const;
export type ThesisHealthStatus = (typeof THESIS_HEALTH_STATUSES)[number];

export const THESIS_CONDITION_POLARITIES = [
  "support_if",
  "risk_if",
  "invalidate_if",
] as const;
export type ThesisConditionPolarity = (typeof THESIS_CONDITION_POLARITIES)[number];

export const THESIS_CONDITION_TYPES = [
  "no_new_shelf",
  "no_atm_draw",
  "cash_above",
  "revenue_growth_yoy_above",
  "no_insider_cluster_sales",
  "no_going_concern",
  "filing_event_absent",
  "custom_metric_threshold",
  "custom_event_watch",
] as const;

export type ThesisConditionType = (typeof THESIS_CONDITION_TYPES)[number];

const CONDITION_SET = new Set<string>(THESIS_CONDITION_TYPES);

export function isThesisConditionType(v: string): v is ThesisConditionType {
  return CONDITION_SET.has(v);
}
