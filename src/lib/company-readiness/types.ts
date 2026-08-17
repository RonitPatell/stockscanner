/**
 * Company readiness / hydration types.
 * Statuses are dataset-level — never invent facts when MISSING.
 */

export const COMPANY_DATASETS = [
  "IDENTITY",
  "FINANCIALS",
  "CAPITAL",
  "FILINGS",
  "INSIDERS",
  "OWNERSHIP",
  "INSTITUTIONAL_13F",
  "COMPANY_EVENTS",
  "COMPANY_STATE",
] as const;

export type CompanyDataset = (typeof COMPANY_DATASETS)[number];

export const DATASET_STATUSES = [
  "READY",
  "STALE",
  "MISSING",
  "PROCESSING",
  "UNSUPPORTED",
  "ERROR",
] as const;

export type DatasetStatus = (typeof DATASET_STATUSES)[number];

export const HYDRATION_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
] as const;

export type HydrationJobStatus = (typeof HYDRATION_JOB_STATUSES)[number];

export type DatasetReadiness = {
  dataset: CompanyDataset;
  status: DatasetStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  dataAsOf: string | null;
  nextEligibleRefreshAt: string | null;
  rowCount: number | null;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
  /** Resolved reason code + safe summary for UI/API (Phase 1 data-health contract). */
  health?: import("./data-health.ts").DataHealthResult;
};

export type CompanyReadiness = {
  symbol: string;
  identityStatus: "READY" | "NOT_FOUND" | "NO_CIK" | "ERROR";
  cik: string | null;
  name: string | null;
  covered: boolean;
  hydrationEnqueued: boolean;
  jobStatus: HydrationJobStatus | null;
  datasets: Record<CompanyDataset, DatasetReadiness>;
  /** Convenience aliases used by Research UI. */
  identity: DatasetStatus;
  financials: DatasetStatus;
  capital: DatasetStatus;
  filings: DatasetStatus;
  insiders: DatasetStatus;
  ownership: DatasetStatus;
  institutional13F: DatasetStatus;
  companyEvents: DatasetStatus;
  companyState: DatasetStatus;
};

export type DatasetStateRow = {
  symbol: string;
  dataset: CompanyDataset;
  status: DatasetStatus;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  dataAsOf: Date | null;
  nextEligibleAt: Date | null;
  rowCount: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorSummary: string | null;
};

export type HydrationJobRow = {
  symbol: string;
  status: HydrationJobStatus;
  lockToken: string | null;
  lockedAt: Date | null;
  attemptCount: number;
  nextEligibleAt: Date;
  requestedAt: Date;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorSummary: string | null;
  requestedByUserId: string | null;
};

export type InspectSnapshot = {
  rowCount: number;
  dataAsOf: Date | null;
};

export type ReadinessInspect = Record<
  Exclude<CompanyDataset, "IDENTITY">,
  InspectSnapshot
>;

export type EnsureCompanyReadyOptions = {
  enqueue?: boolean;
  ensureCoverage?: boolean;
  include13F?: boolean;
  userId?: string | null;
  now?: Date;
  /** Skip identity persist side effects in tests by injecting a result. */
  identity?: import("../company-identity/types.ts").CompanyIdentityResult;
};

export const DATASET_STALE_MS: Record<
  Exclude<CompanyDataset, "IDENTITY" | "COMPANY_EVENTS" | "COMPANY_STATE">,
  number
> = {
  FINANCIALS: 45 * 24 * 3600_000,
  CAPITAL: 14 * 24 * 3600_000,
  FILINGS: 45 * 24 * 3600_000,
  INSIDERS: 14 * 24 * 3600_000,
  OWNERSHIP: 30 * 24 * 3600_000,
  INSTITUTIONAL_13F: 120 * 24 * 3600_000,
};

export const DERIVED_DATASET_STALE_MS: Record<"COMPANY_EVENTS" | "COMPANY_STATE", number> = {
  COMPANY_EVENTS: 14 * 24 * 3600_000,
  COMPANY_STATE: 45 * 24 * 3600_000,
};

export const HYDRATE_DATASETS: CompanyDataset[] = [
  "FINANCIALS",
  "CAPITAL",
  "FILINGS",
  "INSIDERS",
  "OWNERSHIP",
];
