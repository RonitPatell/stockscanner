/**
 * Admin diagnostics for "Why is Financials empty for RKLB?"
 * No secrets, no user PII.
 */

import { prisma } from "../prisma.ts";
import { resolveCompanyIdentity } from "../company-identity/resolve.ts";
import { ensureCompanyReady, productionReadyPorts } from "./index.ts";
import { inspectSymbolDatasets } from "./inspect.ts";
import { COMPANY_DATASETS, type CompanyDataset } from "./types.ts";

type StateRow = {
  symbol: string;
  dataset: string;
  status: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  dataAsOf: Date | null;
  nextEligibleAt: Date | null;
  rowCount: number | null;
  lastErrorSummary: string | null;
};

type JobRow = {
  status: string;
  attemptCount: number;
  lastErrorSummary: string | null;
  nextEligibleAt: Date | null;
};

function datasetStateDelegate() {
  return (
    prisma as unknown as {
      companyDatasetState: {
        findMany: (args: unknown) => Promise<StateRow[]>;
      };
    }
  ).companyDatasetState;
}

function hydrationJobDelegate() {
  return (
    prisma as unknown as {
      companyHydrationJob: {
        findUnique: (args: unknown) => Promise<JobRow | null>;
        findMany: (args: unknown) => Promise<Array<{ status: string }>>;
      };
    }
  ).companyHydrationJob;
}

export type AdminDatasetRow = {
  dataset: CompanyDataset;
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  dataAsOf: string | null;
  rowCount: number | null;
  lastErrorSummary: string | null;
  retryEligible: boolean;
  nextEligibleAt: string | null;
};

export type AdminCompanyReadinessDto = {
  symbol: string;
  identity: {
    status: string;
    symbol: string | null;
    cik: string | null;
    name: string | null;
  };
  coverage: {
    covered: boolean;
    reasons: string[];
    firstCoveredAt: string | null;
  };
  job: {
    status: string | null;
    attemptCount: number | null;
    lastErrorSummary: string | null;
    nextEligibleAt: string | null;
  };
  datasets: AdminDatasetRow[];
};

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function getAdminCompanyReadiness(
  raw: string,
  now: Date = new Date()
): Promise<AdminCompanyReadinessDto> {
  const identity = await resolveCompanyIdentity(raw, { persist: false });
  const symbol = identity.symbol ?? raw.trim().toUpperCase();

  const coverageRows = await prisma.symbolCoverage.findMany({
    where: { symbol },
    select: { reason: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);

  const active = coverageRows.filter(
    (r) => !r.expiresAt || r.expiresAt.getTime() > now.getTime()
  );

  const inspect = await inspectSymbolDatasets(symbol).catch(() => null);
  let states: StateRow[] = [];
  let job: JobRow | null = null;
  try {
    states = await datasetStateDelegate().findMany({ where: { symbol } });
  } catch {
    states = [];
  }
  try {
    job = await hydrationJobDelegate().findUnique({ where: { symbol } });
  } catch {
    job = null;
  }

  const byDs = new Map(states.map((s) => [s.dataset, s]));
  const datasets: AdminDatasetRow[] = COMPANY_DATASETS.filter(
    (d) => d !== "IDENTITY"
  ).map((dataset) => {
    const row = byDs.get(dataset);
    const snap = inspect?.[dataset] ?? null;
    const next = row?.nextEligibleAt ?? job?.nextEligibleAt ?? null;
    const retryEligible = !next || next.getTime() <= now.getTime();
    return {
      dataset,
      status: row?.status ?? "MISSING",
      lastAttemptAt: iso(row?.lastAttemptAt),
      lastSuccessAt: iso(row?.lastSuccessAt),
      dataAsOf: iso(snap?.dataAsOf ?? row?.dataAsOf),
      rowCount: snap?.rowCount ?? row?.rowCount ?? null,
      lastErrorSummary: row?.lastErrorSummary ?? null,
      retryEligible,
      nextEligibleAt: iso(next),
    };
  });

  return {
    symbol,
    identity: {
      status: identity.status,
      symbol: identity.symbol,
      cik: identity.cik,
      name: identity.name,
    },
    coverage: {
      covered: active.length > 0,
      reasons: [...new Set(active.map((r) => r.reason))],
      firstCoveredAt: iso(coverageRows[0]?.createdAt),
    },
    job: {
      status: job?.status ?? null,
      attemptCount: job?.attemptCount ?? null,
      lastErrorSummary: job?.lastErrorSummary ?? null,
      nextEligibleAt: iso(job?.nextEligibleAt),
    },
    datasets,
  };
}

export async function retryAdminHydration(raw: string): Promise<{
  ok: boolean;
  readiness: Awaited<ReturnType<typeof ensureCompanyReady>>;
}> {
  const readiness = await ensureCompanyReady(raw, {
    ports: productionReadyPorts(),
    enqueue: true,
    ensureCoverage: true,
    include13F: false,
  });
  return { ok: true, readiness };
}

export async function collectReadinessAggregates(): Promise<{
  companiesReady: number;
  companiesProcessing: number;
  companiesStale: number;
  companiesError: number;
  financialSuccessRatePct: number;
  capitalSuccessRatePct: number;
  insiderSuccessRatePct: number;
}> {
  let rows: Array<{ symbol: string; dataset: string; status: string }> = [];
  try {
    rows = await datasetStateDelegate().findMany({
      select: { symbol: true, dataset: true, status: true },
    });
  } catch {
    rows = [];
  }

  const bySymbol = new Map<string, string[]>();
  for (const r of rows) {
    const list = bySymbol.get(r.symbol) ?? [];
    list.push(r.status);
    bySymbol.set(r.symbol, list);
  }

  let companiesReady = 0;
  let companiesProcessing = 0;
  let companiesStale = 0;
  let companiesError = 0;
  for (const statuses of bySymbol.values()) {
    if (statuses.includes("ERROR")) companiesError += 1;
    else if (statuses.includes("PROCESSING")) companiesProcessing += 1;
    else if (statuses.includes("STALE")) companiesStale += 1;
    else if (statuses.includes("READY")) companiesReady += 1;
  }

  const rate = (dataset: string) => {
    const ds = rows.filter((r) => r.dataset === dataset);
    if (!ds.length) return 0;
    const ok = ds.filter((r) => r.status === "READY" || r.status === "STALE").length;
    return Math.round((ok / ds.length) * 1000) / 10;
  };

  return {
    companiesReady,
    companiesProcessing,
    companiesStale,
    companiesError,
    financialSuccessRatePct: rate("FINANCIALS"),
    capitalSuccessRatePct: rate("CAPITAL"),
    insiderSuccessRatePct: rate("INSIDERS"),
  };
}
