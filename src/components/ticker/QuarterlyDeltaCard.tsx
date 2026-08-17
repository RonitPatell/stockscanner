import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import { cn } from "@/lib/utils";
import type { QuarterlyDeltaReport } from "@/lib/metrics/quarterly-delta";
import {
  formatAbsoluteChange,
  formatMetricValue,
  formatRelativeChange,
} from "@/lib/metrics/format-delta";

/**
 * Compact Quarterly Delta summary for What Changed.
 * Shows a few material / available rows with a link to Financials.
 */
export function QuarterlyDeltaCard({
  report,
  symbol,
}: {
  report: QuarterlyDeltaReport;
  symbol: string;
}) {
  const sym = symbol.toUpperCase();
  const highlight = report.rows
    .filter((r) => r.comparable && r.emphasis !== "unavailable")
    .sort((a, b) => {
      const rank = (e: string) =>
        e.startsWith("material_") ? 0 : e === "higher" || e === "lower" ? 1 : 2;
      return rank(a.emphasis) - rank(b.emphasis);
    })
    .slice(0, 4);

  return (
    <section
      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
      data-testid="quarterly-delta-card"
      data-guide="quarterly-delta-card"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-zinc-200">Quarterly Delta</h2>
        <Link
          href={`/ticker/${sym}?tab=financials`}
          className="text-[11px] text-emerald-400 hover:underline"
        >
          Full Financials
        </Link>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">
        Period differences for core metrics. Neutral labels only.
      </p>

      {report.empty || highlight.length === 0 ? (
        <p className="text-[12px] text-zinc-600">
          {report.empty
            ? "No observations available yet."
            : "No comparable period changes to show."}
        </p>
      ) : (
        <ul className="space-y-2">
          {highlight.map((row) => (
            <li
              key={row.metricKey}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12px] border-b border-zinc-900/80 pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <span className="text-zinc-300 font-medium">{row.label}</span>
                <span className="text-zinc-600 ml-2 text-[10px]">
                  {row.basisLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono shrink-0">
                <span className="text-zinc-500">
                  {formatMetricValue(row.metricKey, row.previous?.value)}
                </span>
                <span className="text-zinc-600">→</span>
                <span className="text-zinc-100">
                  {formatMetricValue(row.metricKey, row.current?.value)}
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    row.emphasis.includes("higher")
                      ? "text-emerald-400"
                      : row.emphasis.includes("lower")
                        ? "text-rose-400"
                        : "text-zinc-500"
                  )}
                >
                  {formatRelativeChange(row) !== "—"
                    ? formatRelativeChange(row)
                    : formatAbsoluteChange(row.metricKey, row.absoluteChange)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {highlight[0]?.current?.sourceUrl ? (
        <SafeExternalLink
          href={highlight[0].current.sourceUrl}
          className="inline-flex items-center gap-1 mt-3 text-[10px] text-emerald-400 hover:underline"
          fallback="null"
        >
          Latest source <ExternalLink className="w-2.5 h-2.5" />
        </SafeExternalLink>
      ) : null}
    </section>
  );
}
