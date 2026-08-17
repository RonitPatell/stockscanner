/**
 * Shared data-health vocabulary for company datasets.
 * Maps readiness rows → reason codes safe for API/UI.
 */

import type { CompanyIdentityResult } from "../company-identity/types.ts";
import type {
  CompanyDataset,
  DatasetReadiness,
  DatasetStatus,
  HydrationJobRow,
} from "./types.ts";

export const DATA_HEALTH_REASON_CODES = [
  "NOT_HYDRATED",
  "NO_CIK",
  "NO_SYMBOL",
  "SOURCE_UNSUPPORTED",
  "NO_QUALIFYING_RECORDS",
  "PARSER_FAILURE",
  "UPSTREAM_FAILURE",
  "STALE_DATA",
  "PROCESSING",
  "READY",
  "READY_EMPTY_CONFIRMED",
] as const;

export type DataHealthReasonCode = (typeof DATA_HEALTH_REASON_CODES)[number];

export type DataHealthResult = {
  reasonCode: DataHealthReasonCode;
  reasonSummary: string;
  retryEligible: boolean;
  sourceChecked: boolean;
};

const PARSER_ERROR_CODES = new Set([
  "INSIDER_FAILED",
  "OWNERSHIP_FAILED",
  "FILINGS_FAILED",
  "CAPITAL_FAILED",
  "NO_USABLE_FACTS",
]);

const UPSTREAM_ERROR_CODES = new Set([
  "IDENTITY_FAILED",
  "FACTS_FAILED",
  "SUBMISSIONS_FAILED",
]);

/** Datasets where zero rows after a successful check is a valid domain outcome. */
const CONFIRMABLE_EMPTY_DATASETS = new Set<CompanyDataset>([
  "INSIDERS",
  "OWNERSHIP",
  "FILINGS",
  "CAPITAL",
  "INSTITUTIONAL_13F",
  "COMPANY_EVENTS",
]);

function hasQualifyingEmptySummary(summary: string | null | undefined): boolean {
  if (!summary) return false;
  const s = summary.toLowerCase();
  return (
    s.includes("no recent") ||
    s.includes("no structured") ||
    s.includes("no qualifying") ||
    s.includes("no 10-q") ||
    s.includes("no 10-k") ||
    s.includes("in the recent submissions") ||
    s.includes("in the indexed period")
  );
}

export function resolveDataHealthReason(opts: {
  dataset: CompanyDataset;
  row: DatasetReadiness;
  identity: CompanyIdentityResult;
  job: HydrationJobRow | null;
}): DataHealthResult {
  const { dataset, row, identity, job } = opts;
  const status = row.status;
  const attempted = Boolean(row.lastAttemptAt);
  const succeeded = Boolean(row.lastSuccessAt);
  const rows = row.rowCount ?? 0;
  const summary = row.lastErrorSummary?.trim() ?? "";

  if (identity.status === "NOT_FOUND") {
    return {
      reasonCode: "NO_SYMBOL",
      reasonSummary: "This ticker is not in the SEC company mapping TrustTicker uses.",
      retryEligible: false,
      sourceChecked: true,
    };
  }

  if (dataset !== "IDENTITY" && identity.status === "NO_CIK") {
    return {
      reasonCode: "NO_CIK",
      reasonSummary:
        summary ||
        "TrustTicker could not resolve a SEC CIK for this symbol, so filing-based datasets are unavailable.",
      retryEligible: false,
      sourceChecked: identity.status !== "ERROR",
    };
  }

  if (status === "PROCESSING") {
    return {
      reasonCode: "PROCESSING",
      reasonSummary:
        summary ||
        "TrustTicker is preparing this dataset from SEC sources. This usually takes a short time.",
      retryEligible: false,
      sourceChecked: false,
    };
  }

  if (status === "UNSUPPORTED") {
    return {
      reasonCode: "SOURCE_UNSUPPORTED",
      reasonSummary:
        summary ||
        "This dataset is not reliably available from the sources TrustTicker uses for this company.",
      retryEligible: false,
      sourceChecked: attempted,
    };
  }

  if (status === "STALE") {
    return {
      reasonCode: "STALE_DATA",
      reasonSummary:
        summary ||
        (row.dataAsOf
          ? `Showing stored data from ${row.dataAsOf} while a refresh is eligible.`
          : "Stored data is older than the documented freshness window."),
      retryEligible: true,
      sourceChecked: true,
    };
  }

  if (status === "ERROR") {
    const code = row.lastErrorCode ?? "";
    const reasonCode: DataHealthReasonCode = PARSER_ERROR_CODES.has(code)
      ? "PARSER_FAILURE"
      : UPSTREAM_ERROR_CODES.has(code)
        ? "UPSTREAM_FAILURE"
        : "UPSTREAM_FAILURE";
    return {
      reasonCode,
      reasonSummary:
        summary || "TrustTicker could not refresh this dataset. You can retry shortly.",
      retryEligible: true,
      sourceChecked: attempted,
    };
  }

  if (status === "READY") {
    if (rows === 0 && CONFIRMABLE_EMPTY_DATASETS.has(dataset)) {
      return {
        reasonCode: "READY_EMPTY_CONFIRMED",
        reasonSummary:
          summary ||
          defaultEmptySummary(dataset) ||
          "TrustTicker checked the indexed source window and found no qualifying records.",
        retryEligible: false,
        sourceChecked: true,
      };
    }
    return {
      reasonCode: "READY",
      reasonSummary: summary || "Dataset is ready.",
      retryEligible: false,
      sourceChecked: true,
    };
  }

  // MISSING — distinguish not hydrated vs confirmed empty after attempt
  if (attempted && (succeeded || hasQualifyingEmptySummary(summary))) {
    if (rows === 0 && CONFIRMABLE_EMPTY_DATASETS.has(dataset)) {
      return {
        reasonCode: "NO_QUALIFYING_RECORDS",
        reasonSummary:
          summary ||
          defaultEmptySummary(dataset) ||
          "No qualifying records were found in the currently indexed period.",
        retryEligible: false,
        sourceChecked: true,
      };
    }
  }

  if (job?.status === "PENDING" || job?.status === "RUNNING") {
    return {
      reasonCode: "NOT_HYDRATED",
      reasonSummary: "Hydration is queued. TrustTicker has not finished preparing this dataset yet.",
      retryEligible: false,
      sourceChecked: false,
    };
  }

  return {
    reasonCode: "NOT_HYDRATED",
    reasonSummary:
      summary ||
      "This dataset has not been prepared for this company yet. Open Research while signed in to start hydration.",
    retryEligible: identity.status === "READY",
    sourceChecked: attempted,
  };
}

function defaultEmptySummary(dataset: CompanyDataset): string | null {
  switch (dataset) {
    case "INSIDERS":
      return "No qualifying Form 4 insider transactions were found in the indexed submissions window.";
    case "OWNERSHIP":
      return "No qualifying 13D/G beneficial-ownership filing was found in the indexed period.";
    case "FILINGS":
      return "No 10-Q/10-K section comparisons were found in the indexed submissions window.";
    case "CAPITAL":
      return "No qualifying financing filings were found in the indexed window. Liquidity metrics may still be available.";
    case "INSTITUTIONAL_13F":
      return "No institutional 13F holdings snapshots are stored for this symbol yet. 13F is delayed regulatory reporting.";
    case "COMPANY_EVENTS":
      return "No material tracked company events were detected in the indexed period.";
    default:
      return null;
  }
}

export function enrichDatasetHealth(
  row: DatasetReadiness,
  identity: CompanyIdentityResult,
  job: HydrationJobRow | null
): DatasetReadiness {
  const health = resolveDataHealthReason({ dataset: row.dataset, row, identity, job });
  return { ...row, health };
}

export function enrichReadinessHealth<
  T extends {
    datasets: Record<CompanyDataset, DatasetReadiness>;
    identityStatus: CompanyIdentityResult["status"];
    jobStatus: HydrationJobRow["status"] | null;
  },
>(
  readiness: T,
  identity: CompanyIdentityResult,
  job: HydrationJobRow | null
): T {
  const datasets = { ...readiness.datasets };
  for (const key of Object.keys(datasets) as CompanyDataset[]) {
    datasets[key] = enrichDatasetHealth(datasets[key], identity, job);
  }
  return { ...readiness, datasets };
}
