import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OwnershipReport } from "@/lib/ownership/get-report";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100) / 100}%`;
}

function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${Math.round(v * 100) / 100} pp`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function kindTone(kind: string): string {
  switch (kind) {
    case "material_new":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "pct_change":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "exit_reduction":
      return "border-zinc-500/40 bg-zinc-800/60 text-zinc-200";
    default:
      return "border-zinc-700 bg-zinc-900/40 text-zinc-400";
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "material_new":
      return "New material holder";
    case "pct_change":
      return "Ownership % change";
    case "exit_reduction":
      return "Exit / reduction";
    default:
      return "Reported";
  }
}

export function OwnershipTab({ report }: { report: OwnershipReport }) {
  return (
    <section
      className="space-y-5"
      data-testid="ticker-ownership"
      data-guide="ownership"
    >
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">Ownership</h2>
        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-prose">
          Schedule 13D/13G beneficial ownership when percentages are reliably
          extractable. Informational only — not a trading signal.
        </p>
      </header>

      {report.empty ? (
        <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-8 text-center">
          No structured 13D/13G ownership extracts for {report.symbol} yet.
          Unparseable filings still appear as generic SEC events in Watchtower /
          What Changed.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="ownership-filing-list">
          {report.filings.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3"
              data-testid="ownership-filing-row"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">
                    {f.filerName}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {[f.issuerName, f.formType, f.isAmendment ? "amendment" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border shrink-0",
                    kindTone(f.structuredKind)
                  )}
                >
                  {kindLabel(f.structuredKind)}
                </span>
              </div>

              {f.summaryText ? (
                <p className="text-[13px] text-zinc-200 leading-relaxed">
                  {f.summaryText}
                </p>
              ) : (
                <p className="text-[13px] text-zinc-200">
                  Beneficial owner reported {fmtPct(f.percentOwned)}
                </p>
              )}

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <dt className="text-zinc-600">Reported %</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtPct(f.percentOwned)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Shares</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtShares(f.sharesOwned)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Prior %</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtPct(f.previousPercent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Δ %</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtDelta(f.percentChange)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Filed</dt>
                  <dd className="text-zinc-300">{fmtDate(f.filedAt)}</dd>
                </div>
                <div className="sm:col-span-3">
                  <dt className="text-zinc-600">Accession</dt>
                  <dd className="font-mono text-zinc-400 text-[10px]">
                    {f.accessionNumber}
                  </dd>
                </div>
              </dl>

              {f.sourceUrl ? (
                <a
                  href={f.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                >
                  Source <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
