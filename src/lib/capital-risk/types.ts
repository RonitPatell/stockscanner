/**
 * Capital Risk types — factual financing / dilution exposure posture.
 * Never claims a company "will dilute."
 */

import type { CapitalRiskStatusLevel } from "../thesis/types.ts";

export const CAPITAL_RISK_ENGINE_VERSION = "1.0.0";

export type { CapitalRiskStatusLevel };

export const CAPITAL_RISK_REASON_CODES = [
  "NO_ACTIVE_FINANCING_INSTRUMENTS",
  "NO_INSTRUMENT_COVERAGE",
  "FINANCING_CAPACITY_STATUS_UNKNOWN",
  "ACTIVE_ATM",
  "ACTIVE_REGISTERED_DIRECT",
  "ACTIVE_EQUITY_PURCHASE",
  "ACTIVE_CONVERTIBLE",
  "ACTIVE_S3_SHELF",
  "ACTIVE_S1_REGISTRATION",
  "ACTIVE_424B5",
  "ACTIVE_WARRANT",
  "ACTIVE_EFFECTIVE_REGISTRATION",
  "RECENT_REVERSE_SPLIT",
  "ANNOUNCED_SALE_CAPACITY",
  "SHARE_COUNT_YOY_ELEVATED",
  "SHARE_COUNT_YOY_MODERATE",
  "SHARE_COUNT_MULTIYEAR_ELEVATED",
  "SHARE_COUNT_UNKNOWN",
  "RUNWAY_SHORT",
  "RUNWAY_ADEQUATE",
  "RUNWAY_UNKNOWN",
  "CASH_OBSERVED",
  "CASH_UNKNOWN",
  "BURN_UNKNOWN",
  "BURN_NOT_APPLICABLE",
  "INSTRUMENT_CONFLICT",
  "DATA_SPARSE",
] as const;

export type CapitalRiskReasonCode = (typeof CAPITAL_RISK_REASON_CODES)[number];

export type CapitalRiskReason = {
  code: CapitalRiskReasonCode;
  /** Investor-plain factual label — never predictive dilution language. */
  label: string;
  detail: string;
  /** Contributes to elevated | moderate | low | unknown (informational). */
  severity: "elevated" | "moderate" | "low" | "info" | "unknown";
};

export type CapitalLiquidityBlock = {
  cash: number | null;
  cashAsOf: string | null;
  cashSourceUrl: string | null;
  operatingCashFlow: number | null;
  ocfAsOf: string | null;
  /** Quarterly burn estimate (positive = cash leaving). null = unknown. */
  estimatedBurn: number | null;
  /** Quarters of runway when mathematically defensible. */
  runwayQuarters: number | null;
  runwayStatus: "adequate" | "short" | "unknown" | "not_applicable";
  runwayExplanation: string;
};

export type CapitalShareStructureBlock = {
  sharesOutstanding: number | null;
  sharesAsOf: string | null;
  sharesSourceUrl: string | null;
  yoyChangePercent: number | null;
  multiYearChangePercent: number | null;
  multiYearYears: number | null;
  explanation: string;
};

export type CapitalFinancingEvent = {
  id: string;
  instrumentType: string;
  label: string;
  status: string;
  at: string;
  formHint: string | null;
  capacityNote: string;
  sourceUrl: string | null;
  accessionNumber: string | null;
  potentialDilutionPct: number | null;
  estimateLabel: string;
  confidence: number;
};

export type CapitalRiskReport = {
  symbol: string;
  version: string;
  asOf: string;
  status: CapitalRiskStatusLevel;
  /** User-facing: "Elevated capital risk" etc. — never "will dilute". */
  statusLabel: string;
  summary: string;
  reasonCodes: CapitalRiskReasonCode[];
  reasons: CapitalRiskReason[];
  liquidity: CapitalLiquidityBlock;
  shareStructure: CapitalShareStructureBlock;
  financingEvents: CapitalFinancingEvent[];
  snapshotId: string | null;
  instrumentIds: string[];
};

export function capitalRiskStatusLabel(
  status: CapitalRiskStatusLevel
): string {
  switch (status) {
    case "elevated":
      return "Elevated capital risk";
    case "moderate":
      return "Moderate capital risk";
    case "low":
      return "Low capital risk";
    default:
      return "Unknown capital risk";
  }
}
