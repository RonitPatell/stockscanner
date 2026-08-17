/**
 * Thesis condition / health types — evaluative labels only, not trade advice.
 *
 * Automated conditions may later evaluate to PASS | WARN | FAIL | UNKNOWN.
 * CUSTOM_MANUAL is never auto-evaluated.
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
export type ThesisConditionPolarity =
  (typeof THESIS_CONDITION_POLARITIES)[number];

/**
 * Deterministic condition types — no arbitrary executable formulas.
 * Params are validated in schemas.ts per type.
 */
export const THESIS_CONDITION_TYPES = [
  "METRIC_ABOVE",
  "METRIC_BELOW",
  "METRIC_GROWTH_ABOVE",
  "METRIC_GROWTH_BELOW",
  "NO_EVENT_TYPE",
  "EVENT_TYPE_OCCURRED",
  "SHARE_COUNT_CHANGE_BELOW",
  "CAPITAL_RISK_NOT_ABOVE",
  "CASH_RUNWAY_ABOVE",
  "CUSTOM_MANUAL",
] as const;

export type ThesisConditionType = (typeof THESIS_CONDITION_TYPES)[number];

/** Automated evaluation outcomes (never applied to CUSTOM_MANUAL). */
export const THESIS_CONDITION_EVAL_STATES = [
  "PASS",
  "WARN",
  "FAIL",
  "UNKNOWN",
] as const;

export type ThesisConditionEvalState =
  (typeof THESIS_CONDITION_EVAL_STATES)[number];

/**
 * Allowlisted metric keys for METRIC_* / growth conditions.
 * UNKNOWN stays null in observations — never coerce to 0.
 */
export const THESIS_METRIC_KEYS = [
  "revenue",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "net_income",
  "eps",
  "cash",
  "cash_runway_quarters",
  "shares_outstanding",
  "free_cash_flow",
] as const;

export type ThesisMetricKey = (typeof THESIS_METRIC_KEYS)[number];

export const CAPITAL_RISK_STATUS_LEVELS = [
  "unknown",
  "low",
  "moderate",
  "elevated",
] as const;

export type CapitalRiskStatusLevel =
  (typeof CAPITAL_RISK_STATUS_LEVELS)[number];

export const GROWTH_PERIODS = ["yoy", "qoq"] as const;
export type GrowthPeriod = (typeof GROWTH_PERIODS)[number];

const CONDITION_SET = new Set<string>(THESIS_CONDITION_TYPES);
const METRIC_SET = new Set<string>(THESIS_METRIC_KEYS);

export function isThesisConditionType(v: string): v is ThesisConditionType {
  return CONDITION_SET.has(v);
}

export function isThesisMetricKey(v: string): v is ThesisMetricKey {
  return METRIC_SET.has(v);
}

export function isAutomatedConditionType(
  t: ThesisConditionType
): t is Exclude<ThesisConditionType, "CUSTOM_MANUAL"> {
  return t !== "CUSTOM_MANUAL";
}

/** Evidence attached to an automated Thesis Health result. */
export type ThesisConditionEvidenceDto = {
  sourceType: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
  accession?: string | null;
  metricFingerprint?: string | null;
  companyEventId?: string | null;
  capitalRiskSnapshotId?: string | null;
  label: string;
};

/**
 * Display / API evaluation wrapper.
 * Manual conditions never claim an automated PASS/WARN/FAIL/UNKNOWN.
 */
export type ThesisConditionEvaluationDto =
  | {
      mode: "automated";
      /** Defaults to UNKNOWN until Thesis Health persists a result. */
      state: ThesisConditionEvalState;
      explanation?: string;
      observationDate?: string | null;
      actualValue?: number | null;
      threshold?: number | null;
      evidence?: ThesisConditionEvidenceDto;
      evaluatedAt?: string;
    }
  | {
      mode: "manual";
      /** Qualitative — platform cannot verify. */
      state: null;
      explanation?: string;
      evidence?: ThesisConditionEvidenceDto;
      evaluatedAt?: string;
    };

export type ThesisHealthSummaryDto = {
  passing: number;
  warning: number;
  failed: number;
  unknown: number;
  manual: number;
};
