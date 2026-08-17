/**
 * Structured Form 4 / insider intelligence types.
 * Factual transaction context — never predictive alpha.
 */

export const INSIDER_ENGINE_VERSION = "1.0.0";

export const INSIDER_CLASSIFICATIONS = [
  "open_market_purchase",
  "open_market_sale",
  "grant_award",
  "option_exercise",
  "gift",
  "tax_withholding",
  "other",
] as const;

export type InsiderClassification = (typeof INSIDER_CLASSIFICATIONS)[number];

export type ParsedInsiderTransaction = {
  ownerName: string;
  ownerCik: string | null;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPercent: boolean | null;
  officerTitle: string | null;
  issuerName: string | null;
  issuerCik: string | null;
  tradingSymbol: string | null;
  transactionDate: string | null;
  transactionCode: string | null;
  acquiredDisposed: "A" | "D" | null;
  shares: number | null;
  pricePerShare: number | null;
  transactionValue: number | null;
  sharesOwnedAfter: number | null;
  isDirect: boolean | null;
  holdingChange: number | null;
  securityTitle: string | null;
  classification: InsiderClassification;
  is10b51: boolean | null;
  summaryText: string;
  footnoteIds: string[];
  evidenceSnippets: string[];
};

export type Form4ParseResult = {
  version: string;
  accessionNumber: string | null;
  transactions: ParsedInsiderTransaction[];
  footnotes: Record<string, string>;
  parseWarnings: string[];
};

export type InsiderClusterKind = "purchases" | "sales";

export type InsiderCluster = {
  kind: InsiderClusterKind;
  symbol: string;
  windowDays: number;
  count: number;
  owners: string[];
  classifications: InsiderClassification[];
  from: string;
  to: string;
  summary: string;
};
