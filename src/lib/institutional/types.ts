/**
 * Institutional filings (Form 13F) — delayed SEC data, never real-time.
 * Product label: "Institutional filings" — not "smart money signal."
 */

export const INSTITUTIONAL_ENGINE_VERSION = "1.0.0";

export const INSTITUTIONAL_CHANGE_KINDS = [
  "new",
  "increased",
  "reduced",
  "exited",
  "unchanged",
  "unknown",
] as const;

export type InstitutionalChangeKind =
  (typeof INSTITUTIONAL_CHANGE_KINDS)[number];

export type Parsed13fHolding = {
  issuerName: string | null;
  titleOfClass: string | null;
  cusip: string | null;
  /** Shares (SH) — null if not reliably parseable */
  shares: number | null;
  /** Value in USD (converted from SEC $000s) */
  valueUsd: number | null;
  putCall: string | null;
  investmentDiscretion: string | null;
  sshPrnamtType: string | null;
};

export type Parsed13fFiling = {
  version: string;
  filerCik: string | null;
  filerName: string | null;
  reportDate: string | null;
  holdings: Parsed13fHolding[];
  parseWarnings: string[];
};

export type HoldingKey = string; // cusip or normalized issuer|class

export type PriorHolding = {
  symbol: string;
  cusip: string | null;
  shares: number | null;
  valueUsd: number | null;
  reportDate: Date;
  accessionNumber: string | null;
};

export type ClassifiedHolding = Parsed13fHolding & {
  symbol: string;
  changeKind: InstitutionalChangeKind;
  priorShares: number | null;
  priorValueUsd: number | null;
  priorReportDate: Date | null;
  priorAccession: string | null;
  sharesChange: number | null;
  valueChange: number | null;
};
