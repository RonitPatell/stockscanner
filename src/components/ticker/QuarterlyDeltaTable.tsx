import { ExternalLink } from "lucide-react";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import { cn } from "@/lib/utils";
import type {
  DeltaEmphasis,
  QuarterlyDeltaReport,
  QuarterlyDeltaRow,
} from "@/lib/metrics/quarterly-delta";
import {
  formatAbsoluteChange,
  formatFiledDate,
  formatMetricValue,
  formatRelativeChange,
} from "@/lib/metrics/format-delta";

function emphasisClass(e: DeltaEmphasis): string {
  switch (e) {
    case "material_higher":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
    case "material_lower":
      return "bg-rose-500/10 text-rose-300 border-rose-500/30";
    case "higher":
      return "text-emerald-400/90";
    case "lower":
      return "text-rose-400/80";
    case "unavailable":
      return "text-zinc-500";
    default:
      return "text-zinc-400";
  }
}

function RowSource({ row }: { row: QuarterlyDeltaRow }) {
  const cur = row.current;
  if (!cur) return <span className="text-zinc-600">—</span>;
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[11px] text-zinc-400 truncate">
        {cur.periodLabel ?? "—"}
      </div>
      <div className="text-[10px] text-zinc-600">
        Filed {formatFiledDate(cur.filedAt)}
      </div>
      {cur.sourceUrl ? (
        <SafeExternalLink
          href={cur.sourceUrl}
          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
          fallback="null"
        >
          Source <ExternalLink className="w-2.5 h-2.5" />
        </SafeExternalLink>
      ) : (
        <span className="text-[10px] text-zinc-600">No source URL available.</span>
      )}
    </div>
  );
}

function MobileMetricCard({ row }: { row: QuarterlyDeltaRow }) {
  return (
    <article
      className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2"
      data-testid={`qd-row-${row.metricKey}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-medium text-zinc-200">{row.label}</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">{row.basisLabel}</p>
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] px-1.5 py-0.5 rounded border",
            emphasisClass(row.emphasis)
          )}
        >
          {row.changeLabel}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <div>
          <dt className="text-[10px] text-zinc-500">Previous</dt>
          <dd className="font-mono text-zinc-300">
            {formatMetricValue(row.metricKey, row.previous?.value)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-zinc-500">Current</dt>
          <dd className="font-mono text-zinc-100">
            {formatMetricValue(row.metricKey, row.current?.value)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-zinc-500">Abs. change</dt>
          <dd className={cn("font-mono", emphasisClass(row.emphasis))}>
            {formatAbsoluteChange(row.metricKey, row.absoluteChange)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-zinc-500">% / bps</dt>
          <dd className={cn("font-mono", emphasisClass(row.emphasis))}>
            {formatRelativeChange(row)}
          </dd>
        </div>
      </dl>
      <RowSource row={row} />
      {row.unavailableReason && !row.comparable ? (
        <p className="text-[10px] text-zinc-600">{row.unavailableReason}</p>
      ) : null}
    </article>
  );
}

export function QuarterlyDeltaTable({
  report,
}: {
  report: QuarterlyDeltaReport;
}) {
  if (report.empty) {
    return (
      <div
        className="rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-[13px] text-zinc-500"
        data-testid="quarterly-delta-empty"
      >
        No structured financial observations for {report.symbol} yet.
      </div>
    );
  }

  return (
    <div data-testid="quarterly-delta-table" data-guide="quarterly-delta">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] text-zinc-500 max-w-prose">
          Factual differences between comparable reporting periods. Not a full
          earnings document. Incompatible durations are not compared.
        </p>
        <p className="text-[10px] text-zinc-600 font-mono">
          v{report.version}
        </p>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {report.rows.map((row) => (
          <MobileMetricCard key={row.metricKey} row={row} />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-zinc-800">
        <table
          className="w-full text-left text-[12px]"
          aria-label="Quarterly financial deltas"
        >
          <caption className="sr-only">
            Quarter-over-quarter metric changes for {report.symbol}
          </caption>
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-[10px] uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-3 py-2.5 font-medium">
                Metric
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Basis
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium text-right">
                Previous
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium text-right">
                Current
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium text-right">
                Abs.
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium text-right">
                % / bps
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Change
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Period / source
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr
                key={row.metricKey}
                className="border-b border-zinc-900/80 last:border-0"
                data-testid={`qd-row-${row.metricKey}`}
              >
                <td className="px-3 py-2.5 text-zinc-200 font-medium whitespace-nowrap">
                  {row.label}
                </td>
                <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap">
                  {row.basisLabel}
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-400 text-right whitespace-nowrap">
                  {formatMetricValue(row.metricKey, row.previous?.value)}
                </td>
                <td className="px-3 py-2.5 font-mono text-zinc-100 text-right whitespace-nowrap">
                  {formatMetricValue(row.metricKey, row.current?.value)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 font-mono text-right whitespace-nowrap",
                    emphasisClass(row.emphasis)
                  )}
                >
                  {formatAbsoluteChange(row.metricKey, row.absoluteChange)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 font-mono text-right whitespace-nowrap",
                    emphasisClass(row.emphasis)
                  )}
                >
                  {formatRelativeChange(row)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded border inline-block",
                      emphasisClass(row.emphasis)
                    )}
                  >
                    {row.changeLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5 max-w-[11rem]">
                  <RowSource row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
