import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import type { OwnershipReport } from "@/lib/ownership/get-report";
import type { InstitutionalPositionView } from "@/lib/institutional/get-report";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100) / 100}%`;
}

function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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

function instTone(kind: string): string {
  switch (kind) {
    case "new":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "increased":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "reduced":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "exited":
      return "border-zinc-500/40 bg-zinc-800/50 text-zinc-300";
    default:
      return "border-zinc-700 bg-zinc-900/40 text-zinc-400";
  }
}

function InstitutionalRow({ p }: { p: InstitutionalPositionView }) {
  return (
    <li
      className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 space-y-1.5"
      data-testid="institutional-position-row"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-100 break-words">
            {p.filerName}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono">CIK {p.filerCik}</p>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border shrink-0",
            instTone(p.changeKind)
          )}
        >
          {p.changeLabel}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div>
          <dt className="text-zinc-600">Shares</dt>
          <dd className="font-mono text-zinc-300">{fmtShares(p.shares)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Value</dt>
          <dd className="font-mono text-zinc-300">{fmtMoney(p.valueUsd)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Period end</dt>
          <dd className="text-zinc-300">{fmtDate(p.reportDate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Filed</dt>
          <dd className="text-zinc-300">{fmtDate(p.filedAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        {p.accessionNumber ? (
          <span className="font-mono text-[10px]">{p.accessionNumber}</span>
        ) : null}
        {p.sourceUrl ? (
          <SafeExternalLink
            href={p.sourceUrl}
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
            fallback="null"
          >
            Source <ExternalLink className="w-3 h-3" />
          </SafeExternalLink>
        ) : null}
        <a
          href={`/institution/${encodeURIComponent(p.filerCik)}`}
          className="text-zinc-400 hover:text-zinc-200 hover:underline"
        >
          Institution filing
        </a>
      </div>
    </li>
  );
}

export function OwnershipTab({ report }: { report: OwnershipReport }) {
  const inst = report.institutional;

  return (
    <section
      className="space-y-8"
      data-testid="ticker-ownership"
      data-guide="ownership"
    >
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">Ownership</h2>
        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-prose">
          Beneficial ownership (13D/13G) and institutional filings (13F).
          Informational only — not a trading signal.
        </p>
      </header>

      {/* Institutional filings */}
      <section className="space-y-3" data-testid="institutional-filings">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-zinc-200">
            Institutional filings
          </h3>
          <p
            className="text-[12px] text-amber-200/80 border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5 leading-relaxed"
            data-testid="institutional-delay-disclosure"
          >
            {inst.disclosure}
          </p>
        </div>

        {inst.empty ? (
          <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-6 text-center">
            No Form 13F positions resolved for {report.symbol} yet. Ingest runs
            in the background from SEC public filings.
          </p>
        ) : (
          <ul className="space-y-2">
            {inst.positions.map((p) => (
              <InstitutionalRow
                key={`${p.filerCik}-${p.reportDate}-${p.changeKind}`}
                p={p}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 13D/13G */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">
          Beneficial ownership (13D/13G)
        </h3>
        {report.filings.length === 0 ? (
          <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-6 text-center">
            No structured 13D/13G ownership extracts for {report.symbol} yet.
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
                    <p className="text-sm font-semibold text-zinc-100 break-words">
                      {f.filerName}
                    </p>
                    <p className="text-[11px] text-zinc-500 break-words">
                      {[
                        f.issuerName,
                        f.formType,
                        f.isAmendment ? "amendment" : null,
                      ]
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
                  <SafeExternalLink
                    href={f.sourceUrl}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                    fallback="null"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </SafeExternalLink>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
