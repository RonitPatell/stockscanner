"use client";

import { useState } from "react";

type DatasetRow = {
  dataset: string;
  status: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  dataAsOf: string | null;
  rowCount: number | null;
  lastErrorSummary: string | null;
  retryEligible: boolean;
  nextEligibleAt: string | null;
};

type Payload = {
  aggregates: {
    companiesReady: number;
    companiesProcessing: number;
    companiesStale: number;
    companiesError: number;
    financialSuccessRatePct: number;
    capitalSuccessRatePct: number;
    insiderSuccessRatePct: number;
  };
  company: {
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
    datasets: DatasetRow[];
  } | null;
  error?: string;
};

export function AdminCompanyReadinessClient() {
  const [symbol, setSymbol] = useState("RKLB");
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(next = symbol) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/company-readiness?symbol=${encodeURIComponent(next)}`
      );
      if (res.status === 401 || res.status === 403) {
        setError("Admin access required.");
        return;
      }
      if (!res.ok) {
        setError("Could not load readiness.");
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function retry() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/company-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        setError("Retry failed.");
        return;
      }
      setData((await res.json()) as Payload);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  const company = data?.company;
  const agg = data?.aggregates;

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm"
          aria-label="Symbol"
        />
        <button
          type="submit"
          className="rounded border border-zinc-600 px-3 py-1.5 text-sm"
          disabled={loading}
        >
          Look up
        </button>
        <button
          type="button"
          className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300"
          disabled={loading}
          onClick={() => void retry()}
        >
          Retry hydration
        </button>
      </form>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {agg ? (
        <section className="grid sm:grid-cols-4 gap-3 text-sm">
          <Stat label="READY" value={agg.companiesReady} />
          <Stat label="PROCESSING" value={agg.companiesProcessing} />
          <Stat label="STALE" value={agg.companiesStale} />
          <Stat label="ERROR" value={agg.companiesError} />
          <Stat label="Financial success %" value={`${agg.financialSuccessRatePct}%`} />
          <Stat label="Capital success %" value={`${agg.capitalSuccessRatePct}%`} />
          <Stat label="Insider success %" value={`${agg.insiderSuccessRatePct}%`} />
        </section>
      ) : null}
      {company ? (
        <section className="space-y-4" data-testid="admin-company-readiness">
          <div className="rounded-lg border border-zinc-800 p-4 text-sm">
            <h2 className="font-semibold mb-2">Identity</h2>
            <p>
              {company.identity.symbol ?? company.symbol} · CIK{" "}
              {company.identity.cik ?? "missing"} · {company.identity.name ?? "—"}
            </p>
            <p className="text-zinc-500 mt-1">Status: {company.identity.status}</p>
            <p className="text-zinc-500">
              Coverage: {company.coverage.covered ? "yes" : "no"}
              {company.coverage.reasons.length
                ? ` (${company.coverage.reasons.join(", ")})`
                : ""}
            </p>
            <p className="text-zinc-500">
              Job: {company.job.status ?? "none"}
              {company.job.lastErrorSummary
                ? ` · ${company.job.lastErrorSummary}`
                : ""}
            </p>
          </div>
          <table className="w-full text-left text-[12px] border-collapse">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th className="py-2">Dataset</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Last attempt</th>
                <th>Last success</th>
                <th>As of</th>
                <th>Error</th>
                <th>Retry</th>
              </tr>
            </thead>
            <tbody>
              {company.datasets.map((d) => (
                <tr key={d.dataset} className="border-b border-zinc-900">
                  <td className="py-2 font-mono">{d.dataset}</td>
                  <td>{d.status}</td>
                  <td>{d.rowCount ?? "—"}</td>
                  <td>{d.lastAttemptAt ?? "—"}</td>
                  <td>{d.lastSuccessAt ?? "—"}</td>
                  <td>{d.dataAsOf ?? "—"}</td>
                  <td className="text-zinc-500">{d.lastErrorSummary ?? "—"}</td>
                  <td>{d.retryEligible ? "yes" : "wait"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
