/**
 * Map thesis metric keys → financial MetricObservation keys.
 * Unmapped keys evaluate as UNKNOWN (never invent zeros).
 */

import type { FinancialMetricKey } from "../../metrics/types.ts";
import type { ThesisMetricKey } from "../types.ts";

export function thesisMetricToFinancialKey(
  key: ThesisMetricKey
): FinancialMetricKey | null {
  switch (key) {
    case "revenue":
      return "revenue";
    case "gross_margin":
      return "gross_margin";
    case "operating_margin":
      return "operating_margin";
    case "net_income":
      return "net_income";
    case "eps":
      return "eps_diluted";
    case "cash":
      return "cash";
    case "shares_outstanding":
      return "shares_outstanding";
    case "free_cash_flow":
      return "free_cash_flow";
    case "net_margin":
      // Not produced by the current metrics layer.
      return null;
    case "cash_runway_quarters":
      // Requires burn model — not fabricated here.
      return null;
    default:
      return null;
  }
}
