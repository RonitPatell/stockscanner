/**
 * User-facing copy derived from data-health reason codes.
 * Phase 2 — no generic "no data yet" when the cause is known.
 */

import type { DataHealthReasonCode, DataHealthResult } from "./data-health.ts";
import type { DatasetStatus } from "./types.ts";

export function datasetDisplayName(dataset: string): string {
  switch (dataset) {
    case "FINANCIALS":
      return "Financial data";
    case "CAPITAL":
      return "Capital data";
    case "INSIDERS":
      return "Insider data";
    case "OWNERSHIP":
      return "Ownership data";
    case "FILINGS":
      return "Filing data";
    case "COMPANY_EVENTS":
      return "Company events";
    case "COMPANY_STATE":
      return "Company state";
    case "INSTITUTIONAL_13F":
      return "Institutional 13F data";
    default:
      return dataset.replace(/_/g, " ").toLowerCase();
  }
}

export function bannerCopyFromHealth(
  dataset: string,
  status: DatasetStatus,
  health?: DataHealthResult | null,
  legacyReason?: string | null
): { title: string; body: string } {
  const name = datasetDisplayName(dataset);
  const summary = health?.reasonSummary ?? legacyReason?.slice(0, 220) ?? null;
  const code = health?.reasonCode;

  if (status === "PROCESSING" || code === "PROCESSING") {
    return {
      title: `Preparing ${name.toLowerCase()}`,
      body:
        summary ||
        "TrustTicker is processing this dataset from SEC sources. This usually takes a short time.",
    };
  }

  if (status === "ERROR" || code === "PARSER_FAILURE" || code === "UPSTREAM_FAILURE") {
    return {
      title: "We couldn't refresh this dataset.",
      body: summary || "A refresh failed. You can retry shortly.",
    };
  }

  if (status === "STALE" || code === "STALE_DATA") {
    return {
      title: `${name} may be stale`,
      body:
        summary ||
        "Showing the last stored observations while a refresh is eligible.",
    };
  }

  if (status === "UNSUPPORTED" || code === "SOURCE_UNSUPPORTED" || code === "NO_CIK") {
    return {
      title: `${name} unavailable`,
      body:
        summary ||
        "This dataset is not reliably available from the sources TrustTicker uses for this company.",
    };
  }

  if (
    code === "NO_QUALIFYING_RECORDS" ||
    code === "READY_EMPTY_CONFIRMED" ||
    (status === "READY" && health?.sourceChecked && (health.reasonCode === "READY_EMPTY_CONFIRMED"))
  ) {
    return {
      title: `No qualifying ${name.toLowerCase()} in indexed period`,
      body:
        summary ||
        "TrustTicker checked the indexed source window and found no qualifying records.",
    };
  }

  if (code === "NOT_HYDRATED" || status === "MISSING") {
    return {
      title: `Preparing ${name.toLowerCase()}`,
      body:
        summary ||
        "This dataset has not been prepared for this company yet. Stay on Research while signed in to start hydration.",
    };
  }

  return {
    title: `${name} unavailable`,
    body: summary || `Could not load ${name.toLowerCase()} for this company.`,
  };
}

export function overviewEmptyCopy(
  section: "capital" | "financial" | "insider" | "ownership" | "filing" | "fingerprint" | "companyState" | "events",
  health?: DataHealthResult | null,
  status?: DatasetStatus | null
): string {
  const datasetMap = {
    capital: "CAPITAL",
    financial: "FINANCIALS",
    insider: "INSIDERS",
    ownership: "OWNERSHIP",
    filing: "FILINGS",
    fingerprint: "FINANCIALS",
    companyState: "COMPANY_STATE",
    events: "COMPANY_EVENTS",
  } as const;
  const dataset = datasetMap[section];
  const st = status ?? (health?.reasonCode === "PROCESSING" ? "PROCESSING" : "MISSING");
  return bannerCopyFromHealth(dataset, st, health).body;
}

export function isConfirmedEmpty(health?: DataHealthResult | null): boolean {
  if (!health) return false;
  const codes: DataHealthReasonCode[] = [
    "NO_QUALIFYING_RECORDS",
    "READY_EMPTY_CONFIRMED",
  ];
  return codes.includes(health.reasonCode);
}
