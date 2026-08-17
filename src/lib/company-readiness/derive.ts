import type { CompanyIdentityResult } from "../company-identity/types.ts";
import { enrichDatasetHealth } from "./data-health.ts";
import {
  COMPANY_DATASETS,
  DATASET_STALE_MS,
  DERIVED_DATASET_STALE_MS,
  type CompanyDataset,
  type CompanyReadiness,
  type DatasetReadiness,
  type DatasetStateRow,
  type DatasetStatus,
  type HydrationJobRow,
  type InspectSnapshot,
  type ReadinessInspect,
} from "./types.ts";

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function identityDatasetStatus(
  identity: CompanyIdentityResult
): DatasetStatus {
  if (identity.status === "READY") return "READY";
  if (identity.status === "NOT_FOUND") return "MISSING";
  if (identity.status === "NO_CIK") return "ERROR";
  return "ERROR";
}

export function deriveDatasetStatus(opts: {
  dataset: CompanyDataset;
  identity: CompanyIdentityResult;
  inspect: InspectSnapshot | null;
  job: HydrationJobRow | null;
  prior: DatasetStateRow | null;
  now: Date;
  include13F: boolean;
}): DatasetStatus {
  const { dataset, identity, inspect, job, prior, now, include13F } = opts;

  if (dataset === "IDENTITY") return identityDatasetStatus(identity);

  if (dataset === "COMPANY_STATE") {
    return deriveDerivedDatasetStatus({
      inspect: opts.inspect,
      job,
      prior,
      now,
      staleAfter: DERIVED_DATASET_STALE_MS.COMPANY_STATE,
      identity,
      requiresMetrics: true,
    });
  }

  if (dataset === "COMPANY_EVENTS") {
    return deriveDerivedDatasetStatus({
      inspect: opts.inspect,
      job,
      prior,
      now,
      staleAfter: DERIVED_DATASET_STALE_MS.COMPANY_EVENTS,
      identity,
      requiresMetrics: false,
    });
  }

  if (dataset === "INSTITUTIONAL_13F" && !include13F && (inspect?.rowCount ?? 0) === 0) {
    return prior?.status === "UNSUPPORTED" ? "UNSUPPORTED" : "MISSING";
  }

  if (identity.status === "NOT_FOUND") return "MISSING";
  if (identity.status === "NO_CIK" && dataset !== "CAPITAL") {
    return "UNSUPPORTED";
  }

  const running = job?.status === "RUNNING";
  const pending = job?.status === "PENDING";
  const rows = inspect?.rowCount ?? 0;
  const asOf = inspect?.dataAsOf ?? prior?.dataAsOf ?? null;
  const staleAfter =
    dataset === "COMPANY_EVENTS" || dataset === "COMPANY_STATE"
      ? DERIVED_DATASET_STALE_MS[dataset]
      : DATASET_STALE_MS[dataset as Exclude<CompanyDataset, "IDENTITY" | "COMPANY_EVENTS" | "COMPANY_STATE">];

  if (prior?.status === "UNSUPPORTED") return "UNSUPPORTED";

  if (rows === 0) {
    if (running || pending) return "PROCESSING";
    if (prior?.status === "ERROR") return "ERROR";
    return "MISSING";
  }

  if (running && prior?.status === "PROCESSING") return "PROCESSING";

  if (asOf && staleAfter && now.getTime() - asOf.getTime() > staleAfter) {
    if (running || pending) return "PROCESSING";
    return "STALE";
  }

  return "READY";
}

function deriveDerivedDatasetStatus(opts: {
  inspect: InspectSnapshot | null;
  job: HydrationJobRow | null;
  prior: DatasetStateRow | null;
  now: Date;
  staleAfter: number;
  identity: CompanyIdentityResult;
  requiresMetrics: boolean;
}): DatasetStatus {
  const { inspect, job, prior, now, staleAfter, identity, requiresMetrics } = opts;
  if (identity.status === "NOT_FOUND") return "MISSING";
  if (identity.status === "NO_CIK") return "UNSUPPORTED";

  const running = job?.status === "RUNNING";
  const pending = job?.status === "PENDING";
  const rows = inspect?.rowCount ?? 0;
  const asOf = inspect?.dataAsOf ?? prior?.dataAsOf ?? null;

  if (requiresMetrics && rows === 0) {
    if (running || pending) return "PROCESSING";
    if (prior?.status === "ERROR") return "ERROR";
    return "MISSING";
  }

  if (rows === 0) {
    if (running || pending) return "PROCESSING";
    if (prior?.lastSuccessAt || prior?.lastAttemptAt) return "READY";
    return "MISSING";
  }

  if (asOf && now.getTime() - asOf.getTime() > staleAfter) {
    if (running || pending) return "PROCESSING";
    return "STALE";
  }

  return "READY";
}

export function emptyInspect(): ReadinessInspect {
  const z = { rowCount: 0, dataAsOf: null };
  return {
    FINANCIALS: { ...z },
    CAPITAL: { ...z },
    FILINGS: { ...z },
    INSIDERS: { ...z },
    OWNERSHIP: { ...z },
    INSTITUTIONAL_13F: { ...z },
    COMPANY_EVENTS: { ...z },
    COMPANY_STATE: { ...z },
  };
}

export function buildReadinessDto(opts: {
  symbol: string;
  identity: CompanyIdentityResult;
  inspect: ReadinessInspect;
  job: HydrationJobRow | null;
  states: DatasetStateRow[];
  covered: boolean;
  hydrationEnqueued: boolean;
  now: Date;
  include13F: boolean;
}): CompanyReadiness {
  const byDataset = new Map(opts.states.map((s) => [s.dataset, s]));
  const datasets = {} as Record<CompanyDataset, DatasetReadiness>;

  for (const dataset of COMPANY_DATASETS) {
    const prior = byDataset.get(dataset) ?? null;
    const inspect =
      dataset === "IDENTITY"
        ? null
        : dataset === "COMPANY_STATE"
          ? opts.inspect.COMPANY_STATE
          : opts.inspect[dataset as Exclude<CompanyDataset, "IDENTITY" | "COMPANY_STATE">];
    const status = deriveDatasetStatus({
      dataset,
      identity: opts.identity,
      inspect,
      job: opts.job,
      prior,
      now: opts.now,
      include13F: opts.include13F,
    });
    const base: DatasetReadiness = {
      dataset,
      status,
      lastAttemptAt: iso(prior?.lastAttemptAt),
      lastSuccessAt: iso(prior?.lastSuccessAt),
      dataAsOf: iso(inspect?.dataAsOf ?? prior?.dataAsOf ?? null),
      nextEligibleRefreshAt: iso(prior?.nextEligibleAt ?? opts.job?.nextEligibleAt),
      rowCount: inspect?.rowCount ?? prior?.rowCount ?? null,
      lastErrorCode: prior?.lastErrorCode ?? null,
      lastErrorSummary: prior?.lastErrorSummary ?? null,
    };
    datasets[dataset] = enrichDatasetHealth(base, opts.identity, opts.job);
  }

  if (opts.identity.status === "READY") {
    datasets.IDENTITY.status = "READY";
    datasets.IDENTITY.rowCount = 1;
  }

  return {
    symbol: opts.symbol,
    identityStatus: opts.identity.status,
    cik: opts.identity.cik,
    name: opts.identity.name,
    covered: opts.covered,
    hydrationEnqueued: opts.hydrationEnqueued,
    jobStatus: opts.job?.status ?? null,
    datasets,
    identity: datasets.IDENTITY.status,
    financials: datasets.FINANCIALS.status,
    capital: datasets.CAPITAL.status,
    filings: datasets.FILINGS.status,
    insiders: datasets.INSIDERS.status,
    ownership: datasets.OWNERSHIP.status,
    institutional13F: datasets.INSTITUTIONAL_13F.status,
    companyEvents: datasets.COMPANY_EVENTS.status,
    companyState: datasets.COMPANY_STATE.status,
  };
}

export function needsHydration(
  readiness: CompanyReadiness,
  include13F: boolean,
  now: Date = new Date()
): boolean {
  const watch: CompanyDataset[] = [
    "FINANCIALS",
    "CAPITAL",
    "FILINGS",
    "INSIDERS",
    "OWNERSHIP",
  ];
  if (include13F) watch.push("INSTITUTIONAL_13F");
  return watch.some((d) => {
    const row = readiness.datasets[d];
    if (row.status === "UNSUPPORTED" || row.status === "READY") return false;
    if (row.status === "PROCESSING") return false;
    if (row.nextEligibleRefreshAt) {
      const next = new Date(row.nextEligibleRefreshAt);
      if (!Number.isNaN(next.getTime()) && next.getTime() > now.getTime()) {
        return false;
      }
    }
    return (
      row.status === "MISSING" ||
      row.status === "STALE" ||
      row.status === "ERROR"
    );
  });
}
