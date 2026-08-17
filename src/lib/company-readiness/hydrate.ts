/**
 * Run hydration for one symbol using the SAME domain persist functions as cron.
 * Bounded, idempotent, polite. Does not run inside React render.
 */

import { ingestCompanyfactsMetrics } from "../metrics/pipeline.ts";
import { fetchCompanyfacts } from "../metrics/companyfacts.ts";
import { trackRetention } from "../analytics/retention.ts";
import { refreshCapitalRiskSnapshotForSymbol } from "../capital-risk/snapshot.ts";
import { processForm4Filing } from "../insider/persist.ts";
import { processOwnershipFiling } from "../ownership/persist.ts";
import { processFilingSections } from "../filings/persist.ts";
import { processFilingForDilution } from "../dilution/persist.ts";
import { resolveCompanyIdentity } from "../company-identity/resolve.ts";
import { normalizeSymbol } from "../company-identity/normalize.ts";
import {
  fetchCompanySubmissions,
  selectFilingsForHydration,
  type CompanyFilingRef,
} from "./submissions.ts";
import { backoffMs, sanitizeErrorSummary, type DatasetStateStore } from "./stores.ts";
import type { CompanyDataset, DatasetStatus } from "./types.ts";

export type HydrateSymbolPorts = {
  datasets: DatasetStateStore;
  identity?: import("../company-identity/types.ts").CompanyIdentityResult;
  resolveIdentity?: typeof resolveCompanyIdentity;
  fetchFacts?: typeof fetchCompanyfacts;
  ingestFacts?: typeof ingestCompanyfactsMetrics;
  fetchSubmissions?: (cik: string) => Promise<CompanyFilingRef[] | null>;
  processForm4?: typeof processForm4Filing;
  processOwnership?: typeof processOwnershipFiling;
  processFilings?: typeof processFilingSections;
  processDilution?: typeof processFilingForDilution;
  refreshCapital?: typeof refreshCapitalRiskSnapshotForSymbol;
  now?: Date;
};

async function mark(
  datasets: DatasetStateStore,
  symbol: string,
  dataset: CompanyDataset,
  patch: {
    status: DatasetStatus;
    rowCount?: number | null;
    dataAsOf?: Date | null;
    errorCode?: string | null;
    errorSummary?: string | null;
    success?: boolean;
  },
  now: Date
): Promise<void> {
  const prev = await datasets.get(symbol, dataset);
  await datasets.upsert({
    symbol,
    dataset,
    status: patch.status,
    lastAttemptAt: now,
    lastSuccessAt: patch.success ? now : prev?.lastSuccessAt ?? null,
    dataAsOf: patch.dataAsOf ?? prev?.dataAsOf ?? null,
    nextEligibleAt: patch.success
      ? new Date(now.getTime() + 60 * 60_000)
      : new Date(now.getTime() + backoffMs((prev?.attemptCount ?? 0) + 1)),
    rowCount: patch.rowCount ?? prev?.rowCount ?? null,
    attemptCount: (prev?.attemptCount ?? 0) + 1,
    lastErrorCode: patch.errorCode ?? null,
    lastErrorSummary: patch.errorSummary ?? null,
  });
}

export type HydrateSymbolResult = {
  symbol: string;
  identity: DatasetStatus;
  financials: DatasetStatus;
  capital: DatasetStatus;
  filings: DatasetStatus;
  insiders: DatasetStatus;
  ownership: DatasetStatus;
  institutional13F: DatasetStatus;
  errors: string[];
};

export async function hydrateCompanySymbol(
  raw: string,
  ports: HydrateSymbolPorts
): Promise<HydrateSymbolResult> {
  const now = ports.now ?? new Date();
  const symbol = normalizeSymbol(raw);
  const errors: string[] = [];
  const identity =
    ports.identity ??
    (await (ports.resolveIdentity ?? resolveCompanyIdentity)(raw, { persist: true }));

  const out: HydrateSymbolResult = {
    symbol: identity.symbol ?? symbol,
    identity: identity.status === "READY" ? "READY" : identity.status === "NO_CIK" ? "ERROR" : "ERROR",
    financials: "MISSING",
    capital: "MISSING",
    filings: "MISSING",
    insiders: "MISSING",
    ownership: "MISSING",
    institutional13F: "MISSING",
    errors,
  };

  await mark(
    ports.datasets,
    out.symbol,
    "IDENTITY",
    {
      status: out.identity,
      rowCount: identity.cik ? 1 : 0,
      success: identity.status === "READY",
      errorCode: identity.status === "READY" ? null : identity.code,
      errorSummary: identity.status === "READY" ? null : identity.message,
    },
    now
  );

  if (identity.status !== "READY" || !identity.cik) {
    for (const d of ["FINANCIALS", "FILINGS", "INSIDERS", "OWNERSHIP"] as const) {
      await mark(
        ports.datasets,
        out.symbol,
        d,
        {
          status: identity.status === "NO_CIK" ? "UNSUPPORTED" : "ERROR",
          errorCode: identity.code,
          errorSummary: identity.message,
        },
        now
      );
    }
    out.financials = identity.status === "NO_CIK" ? "UNSUPPORTED" : "ERROR";
    out.filings = out.financials;
    out.insiders = out.financials;
    out.ownership = out.financials;
    return out;
  }

  const cik = identity.cik;
  const fetchFacts = ports.fetchFacts ?? fetchCompanyfacts;
  const ingestFacts = ports.ingestFacts ?? ingestCompanyfactsMetrics;

  try {
    await mark(ports.datasets, out.symbol, "FINANCIALS", { status: "PROCESSING" }, now);
    const doc = await fetchFacts(cik);
    if (!doc) {
      out.financials = "ERROR";
      errors.push("financials: companyfacts unavailable");
      await mark(
        ports.datasets,
        out.symbol,
        "FINANCIALS",
        {
          status: "ERROR",
          errorCode: "COMPANYFACTS_UNAVAILABLE",
          errorSummary: "CompanyFacts could not be fetched.",
        },
        now
      );
    } else {
      const r = await ingestFacts({ symbol: out.symbol, doc, cik, persist: true });
      out.financials = r.upserted > 0 || r.observations.length > 0 ? "READY" : "UNSUPPORTED";
      await mark(
        ports.datasets,
        out.symbol,
        "FINANCIALS",
        {
          status: out.financials,
          rowCount: r.observations.length,
          success: out.financials === "READY",
          errorCode: out.financials === "UNSUPPORTED" ? "NO_USABLE_FACTS" : null,
          errorSummary:
            out.financials === "UNSUPPORTED"
              ? "No usable CompanyFacts metrics for this issuer."
              : null,
        },
        now
      );
    }
  } catch (err) {
    out.financials = "ERROR";
    errors.push("financials: failed");
    await mark(
      ports.datasets,
      out.symbol,
      "FINANCIALS",
      {
        status: "ERROR",
        errorCode: "INGEST_FAILED",
        errorSummary: sanitizeErrorSummary(err),
      },
      now
    );
  }

  const fetchSubs = ports.fetchSubmissions ?? fetchCompanySubmissions;
  let selected = {
    form4: [] as CompanyFilingRef[],
    periodic: [] as CompanyFilingRef[],
    ownership: [] as CompanyFilingRef[],
    capital: [] as CompanyFilingRef[],
  };
  try {
    const refs = await fetchSubs(cik);
    if (refs) selected = selectFilingsForHydration(refs);
  } catch (err) {
    errors.push("submissions: failed");
    void err;
  }

  const processForm4 = ports.processForm4 ?? processForm4Filing;
  try {
    await mark(ports.datasets, out.symbol, "INSIDERS", { status: "PROCESSING" }, now);
    let extracted = 0;
    for (const f of selected.form4) {
      const r = await processForm4({
        symbol: out.symbol,
        cik,
        accessionNumber: f.accessionNumber,
        sourceUrl: f.sourceUrl,
        filedAt: f.filingDate,
      });
      extracted += r.extracted;
    }
    out.insiders =
      extracted > 0 || selected.form4.length === 0 ? (extracted > 0 ? "READY" : "MISSING") : "READY";
    if (selected.form4.length === 0) out.insiders = "MISSING";
    if (extracted > 0) out.insiders = "READY";
    await mark(
      ports.datasets,
      out.symbol,
      "INSIDERS",
      {
        status: out.insiders,
        rowCount: extracted,
        success: out.insiders === "READY",
        errorSummary:
          out.insiders === "MISSING"
            ? "No recent Form 4 filings in the company submissions index."
            : null,
      },
      now
    );
  } catch (err) {
    out.insiders = "ERROR";
    errors.push("insiders: failed");
    await mark(
      ports.datasets,
      out.symbol,
      "INSIDERS",
      { status: "ERROR", errorCode: "INSIDER_FAILED", errorSummary: sanitizeErrorSummary(err) },
      now
    );
  }

  const processOwnership = ports.processOwnership ?? processOwnershipFiling;
  try {
    await mark(ports.datasets, out.symbol, "OWNERSHIP", { status: "PROCESSING" }, now);
    let extracted = 0;
    for (const f of selected.ownership) {
      const r = await processOwnership({
        symbol: out.symbol,
        cik,
        accessionNumber: f.accessionNumber,
        sourceUrl: f.sourceUrl,
        filedAt: f.filingDate,
        formType: f.form,
      });
      if (r.extracted) extracted += 1;
    }
    out.ownership = extracted > 0 ? "READY" : "MISSING";
    await mark(
      ports.datasets,
      out.symbol,
      "OWNERSHIP",
      {
        status: out.ownership,
        rowCount: extracted,
        success: extracted > 0,
        errorSummary:
          extracted === 0
            ? "No structured 13D/13G extracts in the recent submissions window."
            : null,
      },
      now
    );
  } catch (err) {
    out.ownership = "ERROR";
    errors.push("ownership: failed");
    await mark(
      ports.datasets,
      out.symbol,
      "OWNERSHIP",
      { status: "ERROR", errorCode: "OWNERSHIP_FAILED", errorSummary: sanitizeErrorSummary(err) },
      now
    );
  }

  const processFilings = ports.processFilings ?? processFilingSections;
  try {
    await mark(ports.datasets, out.symbol, "FILINGS", { status: "PROCESSING" }, now);
    let processed = 0;
    for (const f of selected.periodic) {
      const r = await processFilings({
        symbol: out.symbol,
        cik,
        accessionNumber: f.accessionNumber,
        sourceUrl: f.sourceUrl,
        formType: f.form,
        filingDate: f.filingDate,
      });
      processed += r.processed;
    }
    out.filings = processed > 0 ? "READY" : "MISSING";
    await mark(
      ports.datasets,
      out.symbol,
      "FILINGS",
      {
        status: out.filings,
        rowCount: processed,
        success: processed > 0,
        errorSummary:
          processed === 0
            ? "No 10-Q/10-K section snapshots in the recent submissions window."
            : null,
      },
      now
    );
  } catch (err) {
    out.filings = "ERROR";
    errors.push("filings: failed");
    await mark(
      ports.datasets,
      out.symbol,
      "FILINGS",
      { status: "ERROR", errorCode: "FILINGS_FAILED", errorSummary: sanitizeErrorSummary(err) },
      now
    );
  }

  const processDilution = ports.processDilution ?? processFilingForDilution;
  const refreshCapital = ports.refreshCapital ?? refreshCapitalRiskSnapshotForSymbol;
  try {
    await mark(ports.datasets, out.symbol, "CAPITAL", { status: "PROCESSING" }, now);
    let extracted = 0;
    for (const f of selected.capital) {
      const r = await processDilution({
        symbol: out.symbol,
        cik,
        formType: f.form,
        accessionNumber: f.accessionNumber,
        sourceUrl: f.sourceUrl,
        filingDate: f.filingDate,
        title: `${f.form} ${out.symbol}`,
        summary: null,
      });
      extracted += r.extracted;
    }
    await refreshCapital(out.symbol).catch(() => {});
    out.capital = extracted > 0 ? "READY" : "MISSING";
    await mark(
      ports.datasets,
      out.symbol,
      "CAPITAL",
      {
        status: out.capital,
        rowCount: extracted,
        success: true,
        errorSummary:
          extracted === 0
            ? "No qualifying financing events in the recent submissions window."
            : null,
      },
      now
    );
    // Capital still has an explainable evaluated state even with 0 instruments.
    if (out.capital === "MISSING") out.capital = "READY";
  } catch (err) {
    out.capital = "ERROR";
    errors.push("capital: failed");
    await mark(
      ports.datasets,
      out.symbol,
      "CAPITAL",
      { status: "ERROR", errorCode: "CAPITAL_FAILED", errorSummary: sanitizeErrorSummary(err) },
      now
    );
  }

  await mark(
    ports.datasets,
    out.symbol,
    "INSTITUTIONAL_13F",
    {
      status: "MISSING",
      errorSummary: "13F hydrates on its own cron because of filing size.",
    },
    now
  );
  out.institutional13F = "MISSING";

  if (out.financials === "READY") {
    void trackRetention("company_hydration_ready", {
      props: { symbol: out.symbol, financials: "READY" },
    });
  }

  return out;
}
