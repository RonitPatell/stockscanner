"use client";

import type { CompanyStateReport, StateDimension } from "@/lib/company-state";
import { cn } from "@/lib/utils";

const TAB_FOR_DIMENSION: Record<string, string> = {
  growth: "financials",
  profitability: "financials",
  cash: "financials",
  balance_sheet: "financials",
  share_structure: "financials",
  capital: "capital",
  management: "what-changed",
  insiders: "insiders",
  ownership: "ownership",
};

function trendTone(trend: StateDimension["trend"]): string {
  switch (trend) {
    case "improving":
      return "text-emerald-400";
    case "deteriorating":
      return "text-amber-300";
    case "stable":
      return "text-zinc-400";
    case "mixed":
      return "text-zinc-300";
    default:
      return "text-zinc-600";
  }
}

export function CompanyStatePanel({
  report,
  onOpenTab,
  emptyMessage,
}: {
  report: CompanyStateReport | null;
  onOpenTab?: (tab: string) => void;
  emptyMessage?: string | null;
}) {
  if (!report) {
    return (
      <p className="text-sm text-zinc-500" data-testid="company-state-empty">
        {emptyMessage ||
          "Company state is not available until financial observations are prepared for this symbol."}
      </p>
    );
  }

  return (
    <div
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="company-state-panel"
    >
      {report.dimensions.map((dim) => (
        <button
          key={dim.id}
          type="button"
          onClick={() => onOpenTab?.(TAB_FOR_DIMENSION[dim.id] ?? "overview")}
          className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-left hover:border-zinc-700 transition-colors"
          data-testid={`company-state-${dim.id}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              {dim.label}
            </span>
            <span className={cn("text-[10px] font-medium capitalize", trendTone(dim.trend))}>
              {dim.trend}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-zinc-200 leading-snug">{dim.summary}</p>
          {dim.values[0]?.value != null ? (
            <p className="mt-1 text-[11px] font-mono text-zinc-400">
              {dim.values[0].label}: {formatVal(dim.values[0].value, dim.values[0].unit)}
            </p>
          ) : dim.status === "unknown" ? (
            <p className="mt-1 text-[11px] text-zinc-600">—</p>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function formatVal(v: number, unit: string | null): string {
  if (!Number.isFinite(v)) return "—";
  if (unit === "percent" || unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "shares") return v.toLocaleString("en-US");
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return String(v);
}
