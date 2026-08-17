/**
 * Canonical company identity — SymbolMaster + SEC company_tickers.
 * Does not invent CIKs. Does not claim CompanyFacts coverage.
 */

export const COMPANY_IDENTITY_STATUSES = [
  "READY",
  "NOT_FOUND",
  "NO_CIK",
  "ERROR",
] as const;

export type CompanyIdentityStatus = (typeof COMPANY_IDENTITY_STATUSES)[number];

export const COMPANY_IDENTITY_CODES = [
  "OK",
  "INVALID_SYMBOL",
  "UNKNOWN_SYMBOL",
  "NO_CIK",
  "MAPPING_UNAVAILABLE",
  "STORE_ERROR",
] as const;

export type CompanyIdentityCode = (typeof COMPANY_IDENTITY_CODES)[number];

export const COMPANY_IDENTITY_SOURCES = [
  "symbol_master",
  "sec_mapping",
  "curated",
  "none",
] as const;

export type CompanyIdentitySource = (typeof COMPANY_IDENTITY_SOURCES)[number];

export type CompanyIdentityRecord = {
  symbol: string;
  name: string | null;
  cik: string | null;
  assetType: string;
  isActive: boolean;
  refreshedAt: Date;
};

export type CompanyIdentityResult = {
  status: CompanyIdentityStatus;
  /** Normalized requested ticker (even when NOT_FOUND). */
  requestedSymbol: string;
  /** Canonical listed ticker when known (may differ after a ticker change). */
  symbol: string | null;
  cik: string | null;
  name: string | null;
  assetType: string | null;
  source: CompanyIdentitySource;
  aliasedFrom: string | null;
  persisted: boolean;
  mappingAvailable: boolean;
  code: CompanyIdentityCode;
  /** Short operator/UI reason — never secrets, env, or stack traces. */
  message: string;
};

export type SecTickerEntry = {
  ticker: string;
  cik: string;
  title: string | null;
};

export type SecTickerMapResult = {
  ok: boolean;
  byTicker: Map<string, SecTickerEntry>;
  /** Padded CIK → current SEC ticker (last write wins if duplicates). */
  byCik: Map<string, SecTickerEntry>;
  fetchedAt: number;
  errorCode: "ok" | "rate_limited" | "http_error" | "invalid_payload" | "network";
};

export type CompanyIdentityStore = {
  findBySymbol(symbol: string): Promise<CompanyIdentityRecord | null>;
  findByCik(cik: string): Promise<CompanyIdentityRecord[]>;
  upsert(row: {
    symbol: string;
    name: string | null;
    cik: string | null;
    assetType: string;
    isActive: boolean;
    refreshedAt: Date;
  }): Promise<CompanyIdentityRecord>;
};

export type ResolveCompanyIdentityOptions = {
  store?: CompanyIdentityStore;
  /** Injected mapping (tests / offline). Omitted → live SEC map with cache. */
  mapping?: SecTickerMapResult | "unavailable";
  persist?: boolean;
  now?: Date;
};
