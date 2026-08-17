/**
 * Routine activity detection — default What Changed hides these.
 */

import type { SignificanceLevel, SignificanceReasonCode } from "../company-events/significance.ts";

const ROUTINE_EVENT_TYPES = new Set([
  "sec_10k",
  "sec_10q",
  "sec_13f",
  "institutional_13f_update",
  "sec_13g_a",
  "sec_def14a",
  "sec_other",
]);

const ROUTINE_REASON_CODES = new Set<string>([
  "ROUTINE_PERIODIC_FILING",
  "ROUTINE_OWNERSHIP_AMENDMENT",
  "ROUTINE_INSIDER_FORM",
  "ROUTINE_COMPENSATION_GRANT",
  "PROXY_OR_ADMINISTRATIVE",
  "ADMINISTRATIVE_FILING",
  "EFFECTIVE_REGISTRATION_NOTICE",
  "NO_MATERIAL_IMPACT_EVIDENCE",
]);

/** Elevating codes — keep the event even if a routine code also fired. */
const ELEVATING_CODES = new Set<string>([
  "GOING_CONCERN",
  "BANKRUPTCY_RECEIVERSHIP",
  "AUDITOR_RESIGNATION_OR_DISMISSAL",
  "RESTATEMENT_OR_NON_RELIANCE",
  "MAJOR_CAPITAL_RAISE",
  "MAJOR_MANAGEMENT_DEPARTURE",
  "LATE_PERIODIC_REPORT",
  "SUBSTANTIAL_SHARE_COUNT_INCREASE",
  "IMPAIRMENT_DISCLOSURE",
  "NEW_SHELF_REGISTRATION",
  "OWNERSHIP_THRESHOLD_CHANGE",
  "OWNERSHIP_MATERIAL_NEW",
  "OWNERSHIP_PCT_CHANGE",
  "OWNERSHIP_EXIT_REDUCTION",
  "NEW_DEBT_OR_MATERIAL_AGREEMENT",
  "MATERIAL_MARGIN_OR_RESULTS",
  "INSIDER_OPEN_MARKET_SALE",
  "ATM_PROGRAM_DETECTED",
  "CAPITAL_RISK_LEVEL_CHANGE",
  "CONVERTIBLE_OR_WARRANT_CAPITAL",
  "DIRECTOR_OR_BOARD_CHANGE",
  "INSIDER_CLUSTER",
  "FILING_SECTION_CHANGE",
]);

export function isRoutineActivity(opts: {
  eventType: string;
  significanceLevel: SignificanceLevel | null;
  reasonCodes: SignificanceReasonCode[] | string[];
}): boolean {
  const codes = opts.reasonCodes.map(String);
  if (codes.some((c) => ELEVATING_CODES.has(c))) return false;

  if (
    opts.significanceLevel === "HIGH" ||
    opts.significanceLevel === "MEDIUM"
  ) {
    return false;
  }

  if (codes.some((c) => ROUTINE_REASON_CODES.has(c))) return true;
  if (ROUTINE_EVENT_TYPES.has(opts.eventType)) return true;

  if (opts.significanceLevel === "INFORMATIONAL") return true;

  return false;
}
