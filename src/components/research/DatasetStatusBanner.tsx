"use client";

import { useEffect, useState } from "react";
import type { DatasetStatus } from "@/lib/company-readiness/types";

const MAX_POLLS = 8;

export function DatasetStatusBanner({
  dataset,
  status,
  reason,
  onRetry,
  testId,
}: {
  dataset: string;
  status: DatasetStatus | null;
  reason?: string | null;
  onRetry?: () => void;
  testId?: string;
}) {
  if (!status || status === "READY") return null;

  const copy = bannerCopy(dataset, status, reason);

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 space-y-1"
      data-testid={testId ?? `dataset-status-${dataset.toLowerCase()}`}
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium text-zinc-200">{copy.title}</p>
      <p className="text-[13px] text-zinc-500 leading-relaxed">{copy.body}</p>
      {status === "ERROR" && onRetry ? (
        <button
          type="button"
          className="mt-1 text-[12px] text-emerald-400 hover:underline"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

function bannerCopy(
  dataset: string,
  status: DatasetStatus,
  reason?: string | null
): { title: string; body: string } {
  const name = datasetLabel(dataset);
  if (status === "PROCESSING") {
    return {
      title: `Preparing ${name.toLowerCase()}`,
      body: `TrustTicker is processing the company's latest SEC ${name.toLowerCase()} data.`,
    };
  }
  if (status === "ERROR") {
    return {
      title: "We couldn't refresh this data.",
      body: reason?.slice(0, 180) || "A refresh failed. You can retry shortly.",
    };
  }
  if (status === "STALE") {
    return {
      title: `${name} may be stale`,
      body: "Showing the last stored observations while a refresh is eligible.",
    };
  }
  if (status === "UNSUPPORTED") {
    return {
      title: `${name} unavailable`,
      body:
        reason?.slice(0, 180) ||
        "This company does not provide usable SEC data for this section.",
    };
  }
  return {
    title: `${name} unavailable`,
    body:
      reason?.slice(0, 180) ||
      `No ${name.toLowerCase()} is in TrustTicker yet for this company.`,
  };
}

function datasetLabel(dataset: string): string {
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
    default:
      return dataset;
  }
}

export function useResearchReadiness(symbol: string, entitled: boolean) {
  const [statusMap, setStatusMap] = useState<Record<string, DatasetStatus> | null>(
    null
  );
  const [reasons, setReasons] = useState<Record<string, string | null>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    let polls = 0;
    let delay = 2500;

    async function pull() {
      try {
        const res = await fetch(
          `/api/research/${encodeURIComponent(symbol)}/readiness`,
          { credentials: "include" }
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as {
          readiness?: {
            financials: DatasetStatus;
            capital: DatasetStatus;
            filings: DatasetStatus;
            insiders: DatasetStatus;
            ownership: DatasetStatus;
            datasets?: Record<
              string,
              { status: DatasetStatus; lastErrorSummary: string | null }
            >;
          };
        };
        const r = body.readiness;
        if (!r || cancelled) return;
        setStatusMap({
          FINANCIALS: r.financials,
          CAPITAL: r.capital,
          FILINGS: r.filings,
          INSIDERS: r.insiders,
          OWNERSHIP: r.ownership,
        });
        const nextReasons: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(r.datasets ?? {})) {
          nextReasons[k] = v.lastErrorSummary;
        }
        setReasons(nextReasons);
        const processing = [
          r.financials,
          r.capital,
          r.filings,
          r.insiders,
          r.ownership,
        ].some((s) => s === "PROCESSING");
        polls += 1;
        if (entitled && processing && polls < MAX_POLLS && !cancelled) {
          delay = Math.min(12_000, Math.round(delay * 1.4));
          window.setTimeout(() => {
            if (!cancelled) void pull();
          }, delay);
        }
      } catch {
        /* keep last */
      }
    }

    void pull();
    return () => {
      cancelled = true;
    };
  }, [symbol, entitled, tick]);

  return {
    statusMap,
    reasons,
    retry: () => setTick((n) => n + 1),
  };
}
