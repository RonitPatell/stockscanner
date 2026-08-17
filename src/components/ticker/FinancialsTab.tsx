import { QuarterlyDeltaTable } from "./QuarterlyDeltaTable";
import type { QuarterlyDeltaReport } from "@/lib/metrics/quarterly-delta";
import { SafeExternalLink } from "@/components/SafeExternalLink";

function fmtValue(v: number | null | undefined, unit: string | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "%" || (unit && /percent/i.test(unit))) return `${v.toFixed(1)}%`;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function FinancialsTab({
  report,
}: {
  report: QuarterlyDeltaReport;
}) {
  const latest = report.rows.filter(
    (r) => r.current && r.current.value != null && Number.isFinite(r.current.value)
  );

  return (
    <section data-testid="ticker-financials" className="space-y-6">
      {latest.length > 0 ? (
        <div data-testid="financials-latest-quarter">
          <h2 className="text-sm font-semibold text-zinc-200 mb-1">
            Latest reported
          </h2>
          <p className="text-[12px] text-zinc-500 mb-3 max-w-prose">
            Values from stored SEC CompanyFacts. Missing stays blank — never
            coerced to zero.
          </p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {latest.map((row) => (
              <li
                key={row.metricKey}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2"
                data-testid={`financials-metric-${row.metricKey}`}
              >
                <p className="text-[10px] text-zinc-500">{row.label}</p>
                <p className="font-mono text-sm text-zinc-100">
                  {fmtValue(row.current?.value, row.current?.unit)}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {row.current?.periodLabel ?? "—"}
                  {row.current?.fiscalPeriod
                    ? ` · ${row.current.fiscalPeriod}`
                    : ""}
                </p>
                {row.percentChange != null && Number.isFinite(row.percentChange) ? (
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {row.percentChange > 0 ? "+" : ""}
                    {row.percentChange.toFixed(1)}% {row.basisLabel || "YoY"}
                  </p>
                ) : row.bpsChange != null && Number.isFinite(row.bpsChange) ? (
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {row.bpsChange > 0 ? "+" : ""}
                    {Math.round(row.bpsChange)} bps
                  </p>
                ) : null}
                {row.current?.sourceUrl ? (
                  <SafeExternalLink
                    href={row.current.sourceUrl}
                    className="text-[10px] text-emerald-400 hover:underline"
                    fallback="null"
                  >
                    Source filing
                  </SafeExternalLink>
                ) : row.current?.accession ? (
                  <p className="text-[10px] text-zinc-600 font-mono">
                    {row.current.accession}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h2 className="text-sm font-semibold text-zinc-200 mb-1">
          Quarterly Delta
        </h2>
        <p className="text-[12px] text-zinc-500 leading-relaxed max-w-prose">
          Compare core metrics across reporting periods without reading the full
          filing. Labels stay factual: higher, lower, unavailable.
        </p>
      </div>
      <QuarterlyDeltaTable report={report} />
    </section>
  );
}
