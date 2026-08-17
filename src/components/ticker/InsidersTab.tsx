import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import type { InsiderReport } from "@/lib/insider/get-report";

function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
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

function classTone(c: string): string {
  switch (c) {
    case "open_market_sale":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "open_market_purchase":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "grant_award":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "tax_withholding":
      return "border-zinc-600 bg-zinc-800/50 text-zinc-300";
    default:
      return "border-zinc-700 bg-zinc-900/40 text-zinc-300";
  }
}

export function InsidersTab({ report }: { report: InsiderReport }) {
  return (
    <section className="space-y-5" data-testid="ticker-insiders" data-guide="insiders">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-zinc-100">Insiders</h2>
        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-prose">
          Structured Form 4 transactions from SEC ownership XML. Disposition is
          not automatically an open-market sale. Informational only — not a
          trading signal.
        </p>
      </header>

      {report.empty ? (
        <p className="text-[13px] text-zinc-500 border border-dashed border-zinc-700 rounded-lg px-3 py-8 text-center">
          No structured Form 4 transactions parsed for {report.symbol} yet.
          Wire headlines may still appear on Overview.
        </p>
      ) : (
        <ul className="space-y-3" data-testid="insider-transaction-list">
          {report.transactions.map((tx) => (
            <li
              key={tx.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3"
              data-testid="insider-transaction-row"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 break-words">
                    {tx.ownerName}
                  </p>
                  <p className="text-[11px] text-zinc-500 break-words">
                    {[tx.role, tx.issuerName].filter(Boolean).join(" · ") ||
                      "Reporting person"}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border shrink-0",
                    classTone(tx.classification)
                  )}
                >
                  {tx.classificationLabel}
                </span>
              </div>

              {tx.summaryText ? (
                <p className="text-[13px] text-zinc-200 leading-relaxed">
                  {tx.summaryText}
                </p>
              ) : null}

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <dt className="text-zinc-600">Txn date</dt>
                  <dd className="text-zinc-300">{fmtDate(tx.transactionDate)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Code / A-D</dt>
                  <dd className="font-mono text-zinc-300">
                    {tx.transactionCode ?? "—"}
                    {tx.acquiredDisposed ? ` / ${tx.acquiredDisposed}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Shares</dt>
                  <dd className="font-mono text-zinc-300">{fmtShares(tx.shares)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Price</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtPrice(tx.pricePerShare)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Value</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtMoney(tx.transactionValue)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Ownership</dt>
                  <dd className="text-zinc-300">
                    {tx.isDirect === true
                      ? "Direct"
                      : tx.isDirect === false
                        ? "Indirect"
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">After</dt>
                  <dd className="font-mono text-zinc-300">
                    {fmtShares(tx.sharesOwnedAfter)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-600">Δ holdings</dt>
                  <dd className="font-mono text-zinc-300">
                    {tx.holdingChange == null
                      ? "—"
                      : `${tx.holdingChange > 0 ? "+" : ""}${fmtShares(tx.holdingChange)}`}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                {tx.is10b51 === true ? (
                  <span className="text-sky-400/90">10b5-1 indicated</span>
                ) : null}
                <span className="font-mono">{tx.accessionNumber}</span>
                {tx.sourceUrl ? (
                  <SafeExternalLink
                    href={tx.sourceUrl}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                    fallback="null"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </SafeExternalLink>
                ) : (
                  <span className="text-zinc-600">No source URL available.</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
