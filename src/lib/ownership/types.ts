/**
 * Beneficial ownership (Schedule 13D/13G) types.
 * Factual reporting only — never infer motivations or "smart money."
 */

export const OWNERSHIP_ENGINE_VERSION = "1.0.0";

/** Absolute percentage-point change treated as meaningful when both sides known. */
export const MEANINGFUL_PCT_CHANGE = 1.0;

/** Typical SEC beneficial-ownership materiality threshold. */
export const MATERIAL_OWNERSHIP_PCT = 5.0;

export const OWNERSHIP_STRUCTURED_KINDS = [
  "material_new",
  "pct_change",
  "exit_reduction",
  "none",
] as const;

export type OwnershipStructuredKind =
  (typeof OWNERSHIP_STRUCTURED_KINDS)[number];

export type OwnershipParseStatus = "ok" | "partial" | "unparseable";

export type ParsedBeneficialOwnership = {
  filerName: string | null;
  filerCik: string | null;
  issuerName: string | null;
  tradingSymbol: string | null;
  percentOwned: number | null;
  sharesOwned: number | null;
  formType: string | null;
  isAmendment: boolean;
  confidence: number;
  parseStatus: OwnershipParseStatus;
  evidenceSnippets: string[];
  parseWarnings: string[];
};

export type OwnershipComparison = {
  previousPercent: number | null;
  previousShares: number | null;
  previousAccession: string | null;
  percentChange: number | null;
  structuredKind: OwnershipStructuredKind;
};

export type BeneficialOwnershipExtract = ParsedBeneficialOwnership &
  OwnershipComparison & {
    summaryText: string;
  };
