import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapitalRiskReport } from "@/lib/capital-risk/types";
import type { DilutionTimelineEvent } from "@/lib/dilution/timeline";

function statusTone(status: string): string {
  switch (status) {
    case "elevated":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "moderate":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "low":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
  }
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString("en-US")}`;
}

function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
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

export function CapitalTab({
  report,
  timeline,
}: {
  report: CapitalRiskReport;
  timeline: DilutionTimelineEvent[];
}) {
  return (
    <section className="space-y-6" data-testid="ticker-capital" data-guide="capital-risk">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">Capital Risk</h2>
        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-prose">
          How exposed is this company to financing and dilution risk? Facts
          only — never a prediction that the company will issue shares.
        </p>
      </header>

      <div
        className={cn(
          "rounded-xl border px-4 py-3 space-y-2",
          statusTone(report.status)
        )}
        data-testid="capital-risk-status"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold" data-testid="capital-risk-status-label">
            {report.statusLabel}
          </p>
          <p className="text-[10px] uppercase tracking-wide opacity-70">
            {report.status}
          </p>
        </div>
        <p className="text-[12px] leading-relaxed opacity-90">{report.summary}</p>
        <ul className="flex flex-wrap gap-1.5 pt-1" data-testid="capital-risk-reasons">
          {report.reasons.map((r) => (
            <li
              key={r.code}
              className="text-[10px] px-1.5 py-0.5 rounded border border-current/20 bg-black/10"
              title={r.detail}
            >
              {r.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Liquidity */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Liquidity</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
          <div>
            <dt className="text-[10px] text-zinc-500">Cash</dt>
            <dd className="font-mono text-zinc-100">
              {fmtMoney(report.liquidity.cash)}
            </dd>
            <dd className="text-[10px] text-zinc-600">
              {fmtDate(report.liquidity.cashAsOf)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-zinc-500">Operating cash flow</dt>
            <dd className="font-mono text-zinc-100">
              {fmtMoney(report.liquidity.operatingCashFlow)}
            </dd>
            <dd className="text-[10px] text-zinc-600">
              {fmtDate(report.liquidity.ocfAsOf)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-zinc-500">Estimated runway</dt>
            <dd className="font-mono text-zinc-100">
              {report.liquidity.runwayQuarters != null
                ? `${report.liquidity.runwayQuarters} qtrs`
                : "—"}
            </dd>
            <dd className="text-[10px] text-zinc-500 capitalize">
              {report.liquidity.runwayStatus.replace(/_/g, " ")}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          {report.liquidity.runwayExplanation}
        </p>
      </section>

      {/* Share structure */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Share structure</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
          <div>
            <dt className="text-[10px] text-zinc-500">Shares outstanding</dt>
            <dd className="font-mono text-zinc-100">
              {fmtShares(report.shareStructure.sharesOutstanding)}
            </dd>
            <dd className="text-[10px] text-zinc-600">
              {fmtDate(report.shareStructure.sharesAsOf)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-zinc-500">YoY change</dt>
            <dd className="font-mono text-zinc-100">
              {fmtPct(report.shareStructure.yoyChangePercent)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-zinc-500">
              Multi-year
              {report.shareStructure.multiYearYears != null
                ? ` (~${report.shareStructure.multiYearYears}y)`
                : ""}
            </dt>
            <dd className="font-mono text-zinc-100">
              {fmtPct(report.shareStructure.multiYearChangePercent)}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-zinc-500">
          {report.shareStructure.explanation}
        </p>
        {report.shareStructure.sharesSourceUrl ? (
          <a
            href={report.shareStructure.sharesSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
          >
            Source <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </section>

      {/* Financing events */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">
          Financing events
        </h3>
        {report.financingEvents.length === 0 ? (
          <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-6 text-center">
            No financing instruments extracted for this symbol yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="capital-financing-events">
            {report.financingEvents.map((ev) => (
              <li
                key={ev.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 mb-1">
                  {ev.formHint ? (
                    <span className="text-sky-400/90">{ev.formHint}</span>
                  ) : null}
                  <span className="capitalize">{ev.status}</span>
                  <time className="ml-auto">{fmtDate(ev.at)}</time>
                </div>
                <p className="text-[13px] text-zinc-200">{ev.label}</p>
                <p className="text-[11px] text-zinc-500 mt-1">{ev.capacityNote}</p>
                {ev.sourceUrl ? (
                  <a
                    href={ev.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-emerald-400 hover:underline"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dilution timeline (reuse) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">
          Dilution timeline
        </h3>
        <p className="text-[11px] text-zinc-500">
          Existing DilutionInstrument timeline — capacity is not confirmed
          dilution.
        </p>
        {timeline.length === 0 ? (
          <p className="text-[13px] text-zinc-600">No timeline events yet.</p>
        ) : (
          <ul className="space-y-2" data-testid="capital-dilution-timeline">
            {timeline.slice(0, 12).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-[12px] border-b border-zinc-900 py-2"
              >
                <div className="min-w-0">
                  <span className="text-zinc-200">{t.label}</span>
                  <span className="text-zinc-600 ml-2 text-[10px]">
                    {t.capacityNote}
                  </span>
                </div>
                <time className="text-[10px] text-zinc-500 shrink-0">
                  {fmtDate(t.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
