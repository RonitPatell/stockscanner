/**
 * Financial metric layer — change monitoring + thesis evaluation only.
 * Not a fundamentals terminal. UNKNOWN stays null — never fabricate zeros.
 */

export const FINANCIAL_METRIC_KEYS = [
  "revenue",
  "gross_profit",
  "gross_margin",
  "operating_income",
  "operating_margin",
  "net_income",
  "operating_cash_flow",
  "capital_expenditures",
  "free_cash_flow",
  "cash",
  "total_debt",
  "diluted_shares",
  "shares_outstanding",
  "eps_diluted",
] as const;

export type FinancialMetricKey = (typeof FINANCIAL_METRIC_KEYS)[number];

export const METRIC_CONFIDENCES = ["high", "medium", "low", "unknown"] as const;
export type MetricConfidence = (typeof METRIC_CONFIDENCES)[number];

/** Instant = balance-sheet point-in-time; duration = P&L / cash-flow window. */
export type MetricFactKind = "instant" | "duration";

export type SecCompanyfactsUnitPoint = {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

export type SecCompanyfactsConcept = {
  label?: string;
  description?: string;
  units?: Record<string, SecCompanyfactsUnitPoint[]>;
};

/** Minimal shape of data.sec.gov companyfacts JSON we parse. */
export type SecCompanyfactsDocument = {
  cik?: number | string;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, SecCompanyfactsConcept>;
    dei?: Record<string, SecCompanyfactsConcept>;
    [taxonomy: string]: Record<string, SecCompanyfactsConcept> | undefined;
  };
};

export type NormalizedMetricObservation = {
  symbol: string;
  cik: string | null;
  metricKey: FinancialMetricKey;
  value: number | null;
  unit: string | null;
  currency: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodLabel: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  filedAt: Date | null;
  accession: string | null;
  secConcept: string | null;
  sourceType: "sec_companyfacts" | "derived";
  sourceId: string | null;
  sourceUrl: string | null;
  confidence: MetricConfidence;
  evidence: Record<string, unknown>;
  fingerprint: string;
};

export type MetricDeltaKind = "yoy" | "qoq" | "bps" | "share_count";

export type MetricDeltaResult = {
  kind: MetricDeltaKind;
  metricKey: FinancialMetricKey;
  current: NormalizedMetricObservation;
  prior: NormalizedMetricObservation | null;
  /** Absolute change (current - prior). null = UNKNOWN. */
  absoluteChange: number | null;
  /** Percent change ((curr-prior)/|prior|)*100. null = UNKNOWN. */
  percentChange: number | null;
  /** Basis-point change for margin metrics. null = UNKNOWN. */
  bpsChange: number | null;
  comparable: boolean;
  reason: string | null;
};

export const FINANCIAL_METRICS_VERSION = "1.0.0";
