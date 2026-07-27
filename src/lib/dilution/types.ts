/**
 * Dilution Radar V2 — SEC-evidence capital-risk types.
 * Estimates are labeled; dilution % is never invented from unreliable denominators.
 */

export const DILUTION_INSTRUMENT_TYPES = [
  "S1_REGISTRATION",
  "S3_SHELF",
  "PROSPECTUS_424B5",
  "REGISTERED_DIRECT",
  "ATM_PROGRAM",
  "EQUITY_PURCHASE_AGREEMENT",
  "CONVERTIBLE_NOTE",
  "CONVERTIBLE_PREFERRED",
  "WARRANT",
  "WARRANT_REPRICE",
  "REVERSE_SPLIT",
  "EFFECTIVE_REGISTRATION",
  "SHARES_OUTSTANDING_CHANGE",
  "AMENDMENT",
  "TERMINATED_FACILITY",
] as const;

export type DilutionInstrumentType = (typeof DILUTION_INSTRUMENT_TYPES)[number];

export type DilutionInstrumentStatus =
  | "active"
  | "exhausted"
  | "expired"
  | "terminated"
  | "unknown";

export type DilutionEstimateLabel =
  | "estimate"
  | "capacity_only"
  | "announced_sale"
  | "unavailable";

export type DilutionCapacityKind =
  | "registration_capacity"
  | "announced_sale"
  | "atm_availability"
  | "confirmed_issuance"
  | "other";

export interface DilutionExtractionInput {
  symbol: string;
  cik?: string | null;
  formType?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  filingDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  /** Title / headline */
  title: string;
  /** Summary or abstract */
  summary?: string | null;
  /** Filing body or primary document text (may be truncated) */
  body?: string | null;
  sharesOutstanding?: number | null;
  catalystId?: string | null;
  rawNewsId?: string | null;
}

export interface DilutionExtractionResult {
  instrumentType: DilutionInstrumentType;
  status: DilutionInstrumentStatus;
  maxShares: number | null;
  maxDollars: number | null;
  offerPrice: number | null;
  warrantCount: number | null;
  warrantExercisePrice: number | null;
  potentialDilutionPct: number | null;
  estimateLabel: DilutionEstimateLabel;
  capacityKind: DilutionCapacityKind;
  confidence: number;
  missingFields: string[];
  evidenceSnippets: string[];
  structuredSections: Record<string, string>;
  sharesOutstandingDenom: number | null;
  needsManualReview: boolean;
  conflictHint?: string;
}

export const INSTRUMENT_LABELS: Record<DilutionInstrumentType, string> = {
  S1_REGISTRATION: "S-1 registration",
  S3_SHELF: "S-3 shelf registration",
  PROSPECTUS_424B5: "424B5 prospectus supplement",
  REGISTERED_DIRECT: "Registered direct offering",
  ATM_PROGRAM: "At-the-market (ATM) program",
  EQUITY_PURCHASE_AGREEMENT: "Equity purchase agreement",
  CONVERTIBLE_NOTE: "Convertible note",
  CONVERTIBLE_PREFERRED: "Convertible preferred",
  WARRANT: "Warrants outstanding",
  WARRANT_REPRICE: "Warrant reprice",
  REVERSE_SPLIT: "Reverse split",
  EFFECTIVE_REGISTRATION: "Effective registration notice",
  SHARES_OUTSTANDING_CHANGE: "Shares outstanding change",
  AMENDMENT: "Filing amendment",
  TERMINATED_FACILITY: "Terminated facility",
};
