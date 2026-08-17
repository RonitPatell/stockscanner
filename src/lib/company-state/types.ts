/**
 * Company State Engine — deterministic factual summary from persisted evidence.
 * Not a buy/sell score. No opaque ratings.
 */

export const COMPANY_STATE_VERSION = "1.0.0";

export const STATE_TRENDS = [
  "improving",
  "stable",
  "deteriorating",
  "mixed",
  "unknown",
] as const;

export type StateTrend = (typeof STATE_TRENDS)[number];

export const STATE_DIMENSION_IDS = [
  "growth",
  "profitability",
  "cash",
  "balance_sheet",
  "share_structure",
  "capital",
  "management",
  "insiders",
  "ownership",
] as const;

export type StateDimensionId = (typeof STATE_DIMENSION_IDS)[number];

export type StateValuePoint = {
  label: string;
  value: number | null;
  unit: string | null;
  periodLabel: string | null;
  asOf: string | null;
};

export type StateEvidenceLink = {
  category: string;
  linkedModel: string | null;
  linkedId: string | null;
  sourceUrl: string | null;
  availability: "verified" | "derived" | "reported" | "unknown";
  metricKey?: string | null;
};

export type StateDimension = {
  id: StateDimensionId;
  label: string;
  /** Short factual headline — never investment advice. */
  summary: string;
  trend: StateTrend;
  values: StateValuePoint[];
  latestObservationDate: string | null;
  evidence: StateEvidenceLink[];
  /** ready | partial | unsupported | unknown */
  status: "ready" | "partial" | "unsupported" | "unknown";
  unavailableReason: string | null;
};

export type CompanyStateReport = {
  symbol: string;
  cik: string | null;
  version: string;
  asOf: string;
  dimensions: StateDimension[];
};

export function dimensionById(
  report: CompanyStateReport,
  id: StateDimensionId
): StateDimension | null {
  return report.dimensions.find((d) => d.id === id) ?? null;
}
