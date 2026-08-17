import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilingsReport, FilingSectionDiffView } from "@/lib/filings/get-report";

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

function statusTone(status: string): string {
  switch (status) {
    case "changed":
    case "new_section":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "formatting_only":
      return "border-zinc-600 bg-zinc-800/50 text-zinc-400";
    case "unchanged":
      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-200/80";
    case "missing_current":
    case "missing_prior":
      return "border-zinc-700 bg-zinc-900/40 text-zinc-500";
    default:
      return "border-zinc-700 bg-zinc-900/40 text-zinc-400";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "changed":
      return "Changed";
    case "formatting_only":
      return "Formatting only";
    case "unchanged":
      return "Unchanged";
    case "new_section":
      return "New / first seen";
    case "missing_current":
      return "Missing in current";
    case "missing_prior":
      return "No prior";
    default:
      return status;
  }
}

function DiffBlock({ section }: { section: FilingSectionDiffView }) {
  return (
    <li
      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3"
      data-testid="filing-section-diff"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100 break-words">
            {section.sectionTitle}
          </p>
          <p className="text-[11px] text-zinc-500 break-words">
            {section.formType} · {fmtDate(section.filingDate)}
            {section.materialChange ? " · material-sized change" : ""}
          </p>
        </div>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border shrink-0",
            statusTone(section.status)
          )}
        >
          {statusLabel(section.status)}
        </span>
      </div>

      {section.status === "formatting_only" ? (
        <p className="text-[12px] text-zinc-500">
          No substantive wording change detected (whitespace / table formatting
          only).
        </p>
      ) : null}

      {section.added.length > 0 ? (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-emerald-400/90 mb-1">
            Added
          </h4>
          <ul className="space-y-1.5">
            {section.added.slice(0, 8).map((t, i) => (
              <li
                key={`a-${i}`}
                className="text-[12px] text-zinc-300 border-l-2 border-emerald-500/40 pl-2 leading-relaxed break-words"
              >
                {t.length > 400 ? `${t.slice(0, 400)}…` : t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {section.removed.length > 0 ? (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-rose-400/90 mb-1">
            Removed
          </h4>
          <ul className="space-y-1.5">
            {section.removed.slice(0, 8).map((t, i) => (
              <li
                key={`r-${i}`}
                className="text-[12px] text-zinc-400 border-l-2 border-rose-500/40 pl-2 leading-relaxed line-through decoration-zinc-600 break-words"
              >
                {t.length > 400 ? `${t.slice(0, 400)}…` : t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {section.changed.length > 0 ? (
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-amber-400/90 mb-1">
            Changed
          </h4>
          <ul className="space-y-2">
            {section.changed.slice(0, 6).map((c, i) => (
              <li key={`c-${i}`} className="text-[12px] space-y-1">
                <p className="text-zinc-500 border-l-2 border-zinc-600 pl-2">
                  {c.before.length > 280 ? `${c.before.slice(0, 280)}…` : c.before}
                </p>
                <p className="text-zinc-200 border-l-2 border-amber-500/50 pl-2">
                  {c.after.length > 280 ? `${c.after.slice(0, 280)}…` : c.after}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4 text-[11px] pt-1">
        {section.currentSourceUrl ? (
          <a
            href={section.currentSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
          >
            Current filing <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-zinc-600">
            Current: {section.currentAccession}
          </span>
        )}
        {section.priorSourceUrl ? (
          <a
            href={section.priorSourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sky-400 hover:underline"
          >
            Previous filing <ExternalLink className="w-3 h-3" />
          </a>
        ) : section.priorAccession ? (
          <span className="text-zinc-600">
            Previous: {section.priorAccession}
          </span>
        ) : (
          <span className="text-zinc-600">No previous comparable filing</span>
        )}
      </div>
    </li>
  );
}

export function FilingsTab({ report }: { report: FilingsReport }) {
  return (
    <section className="space-y-5" data-testid="ticker-filings-tab" data-guide="filings">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">Filings</h2>
        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-prose">
          Section comparisons for 10-Q vs prior 10-Q and 10-K vs prior 10-K
          (Risk Factors, MD&A, Liquidity when identifiable). Textual diffs only —
          wording changes are not interpreted as specific financial risks.
        </p>
      </header>

      {report.empty ? (
        <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-8 text-center">
          No section comparisons cached for {report.symbol} yet. Diffs are
          computed in the background when 10-Q/10-K filings are ingested.
        </p>
      ) : (
        <ul className="space-y-3">
          {report.sections.map((s) => (
            <DiffBlock key={s.id} section={s} />
          ))}
        </ul>
      )}
    </section>
  );
}
