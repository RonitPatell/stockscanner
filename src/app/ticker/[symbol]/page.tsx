import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { CapitalTab } from "@/components/ticker/CapitalTab";
import { FinancialsTab } from "@/components/ticker/FinancialsTab";
import { InsidersTab } from "@/components/ticker/InsidersTab";
import { OwnershipTab } from "@/components/ticker/OwnershipTab";
import { TickerPlaceholderTab } from "@/components/ticker/TickerPlaceholderTab";
import { TickerWorkspaceTabs } from "@/components/ticker/TickerWorkspaceTabs";
import { ThesisPanel } from "@/components/ticker/thesis/ThesisPanel";
import { WhatChangedTab } from "@/components/ticker/WhatChangedTab";
import { getCapitalRiskReportForSymbol } from "@/lib/capital-risk/snapshot";
import { getDilutionTimeline } from "@/lib/dilution/timeline";
import { getInsiderReportForSymbol } from "@/lib/insider/get-report";
import { getOwnershipReportForSymbol } from "@/lib/ownership/get-report";
import { parseTickerTab } from "@/lib/ticker-tabs";
import { getTickerHubBundle } from "@/lib/ticker-hub";
import { getQuarterlyDeltaForSymbol } from "@/lib/metrics/get-quarterly-delta";
import { getTickerWhatChangedEvents } from "@/lib/ticker-what-changed";
import { cn, formatPercent } from "@/lib/utils";
import { PLUS_PRICE_MO, PRO_PRICE_MO } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  return {
    title: `${sym} Research — TrustTicker`,
    description: `Catalysts, SEC filing context, Form 4 activity, financial deltas, and dilution flags for ${sym}. Informational only.`,
    openGraph: {
      title: `${sym} ticker hub | TrustTicker`,
      description: `Primary-source research hub for ${sym}.`,
    },
  };
}

export default async function TickerPage({ params, searchParams }: Props) {
  const { symbol } = await params;
  const { tab: tabRaw } = await searchParams;
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!sym || sym.length < 1) notFound();

  const tab = parseTickerTab(tabRaw);

  const [
    hub,
    report,
    events,
    capitalReport,
    dilutionTimeline,
    insiderReport,
    ownershipReport,
  ] = await Promise.all([
      getTickerHubBundle(sym),
      getQuarterlyDeltaForSymbol(sym).catch(() => null),
      getTickerWhatChangedEvents(sym).catch(() => []),
      getCapitalRiskReportForSymbol(sym).catch(() => null),
      getDilutionTimeline(sym, 40).catch(() => []),
      getInsiderReportForSymbol(sym).catch(() => null),
      getOwnershipReportForSymbol(sym).catch(() => null),
    ]);

  const emptyReport = {
    symbol: sym,
    version: "1.0.0",
    asOf: new Date().toISOString(),
    rows: [],
    empty: true as const,
  };
  const deltaReport = report ?? emptyReport;

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-bold">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/dashboard?view=research">
            <Button variant="outline" size="sm">
              Research desk
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="sm">Plans from {PLUS_PRICE_MO}</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-2">
            Ticker hub
          </p>
          <h1 className="text-3xl font-bold mb-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-emerald-400">{sym}</span>
            {hub.dilution.active ? (
              <span
                className="text-[11px] font-medium uppercase tracking-wide px-2 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200"
                data-testid="dilution-badge"
              >
                Capital risk
                {hub.dilution.count > 0 ? ` · ${hub.dilution.count}` : ""}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-500 border border-zinc-800 px-2 py-1 rounded">
                No recent financing instruments
              </span>
            )}
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xl">
            Catalysts, Form 4 insider filings, financial period deltas, and
            Capital Risk (liquidity, shares, financing). Free to browse. Plus
            adds alerts. Pro unlocks Capital Risk desk and Markets.
          </p>
          {hub.dilution.latestWhy ? (
            <p className="mt-3 text-[12px] text-amber-200/90 border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5">
              {hub.dilution.latestWhy}
              {hub.dilution.status ? ` · status: ${hub.dilution.status}` : ""}
            </p>
          ) : null}
          <a
            href={hub.edgarSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-[12px] text-emerald-400 hover:underline"
          >
            Search EDGAR for {sym}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <TickerWorkspaceTabs symbol={sym} active={tab} />

        {tab === "thesis" ? <ThesisPanel symbol={sym} /> : null}

        {tab === "financials" ? (
          <FinancialsTab report={deltaReport} />
        ) : null}

        {tab === "what-changed" ? (
          <WhatChangedTab hub={hub} report={deltaReport} events={events} />
        ) : null}

        {tab === "capital" ? (
          capitalReport ? (
            <CapitalTab report={capitalReport} timeline={dilutionTimeline} />
          ) : (
            <TickerPlaceholderTab
              testId="ticker-capital"
              title="Capital Risk"
              body="Capital risk data could not be loaded for this symbol right now."
            />
          )
        ) : null}

        {tab === "insiders" ? (
          insiderReport ? (
            <InsidersTab report={insiderReport} />
          ) : (
            <TickerPlaceholderTab
              testId="ticker-insiders"
              title="Insiders"
              body="Structured Form 4 data could not be loaded for this symbol right now."
            />
          )
        ) : null}

        {tab === "ownership" ? (
          ownershipReport ? (
            <OwnershipTab report={ownershipReport} />
          ) : (
            <TickerPlaceholderTab
              testId="ticker-ownership"
              title="Ownership"
              body="Ownership data could not be loaded for this symbol right now."
            />
          )
        ) : null}

        {tab === "filings" ? (
          <TickerPlaceholderTab
            testId="ticker-filings-tab"
            title="Filings"
            body="A dedicated filings timeline is next. Recent filings and catalysts remain on Overview and What Changed."
          />
        ) : null}

        {tab === "timeline" ? (
          <TickerPlaceholderTab
            testId="ticker-timeline"
            title="Timeline"
            body="A unified company timeline across filings, financials, and capital events is coming soon."
          />
        ) : null}

        {tab === "overview" ? (
          <div className="space-y-8">
            <section data-testid="ticker-form4">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                Insider Form 4 (from wire)
              </h2>
              {hub.form4.length === 0 ? (
                <p className="text-[13px] text-zinc-500">
                  No recent Form 4 headlines mapped to {sym} in our feed.
                </p>
              ) : (
                <ul className="space-y-2">
                  {hub.form4.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mb-1">
                        <span className="text-sky-400/90">{f.formHint}</span>
                        <time>{f.publishedAt.toLocaleString()}</time>
                      </div>
                      <p className="text-sm text-zinc-200">{f.headline}</p>
                      {f.sourceUrl ? (
                        <a
                          href={f.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-emerald-400 hover:underline mt-1 inline-flex items-center gap-1"
                        >
                          Source <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section data-testid="ticker-filings">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                Filings and catalysts
              </h2>
              {hub.filings.length === 0 && hub.catalysts.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-zinc-500">
                  No recent catalysts for {sym} in our feed yet.
                  <Link
                    href="/pricing"
                    className="block mt-4 text-emerald-400 hover:underline"
                  >
                    See Plus / Pro plans
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {(hub.filings.length > 0
                    ? hub.filings
                    : hub.catalysts.map((c) => ({
                        id: c.id,
                        formHint: "Catalyst",
                        headline: c.headline,
                        publishedAt: c.publishedAt,
                        sourceUrl: c.sourceUrl ?? null,
                        kind: "other" as const,
                      }))
                  ).map((r) => (
                    <article
                      key={r.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                          {r.formHint}
                        </span>
                        <time className="text-[10px] text-zinc-500">
                          {r.publishedAt.toLocaleString()}
                        </time>
                      </div>
                      <h3 className="text-sm font-medium text-zinc-200 mb-2">
                        {r.headline}
                      </h3>
                      {r.sourceUrl ? (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
                        >
                          Open source <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {hub.catalysts.some((c) => c.changePercent != null) ? (
              <section>
                <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                  Recent move context
                </h2>
                <div className="space-y-2">
                  {hub.catalysts
                    .filter((c) => c.changePercent != null)
                    .slice(0, 8)
                    .map((r) => (
                      <div
                        key={`m-${r.id}`}
                        className="flex items-center justify-between gap-3 text-[12px] border-b border-zinc-900 py-2"
                      >
                        <span className="text-zinc-400 truncate">
                          {r.headline}
                        </span>
                        <span
                          className={cn(
                            "font-mono shrink-0",
                            (r.changePercent ?? 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          )}
                        >
                          {formatPercent(r.changePercent!)}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        <p className="text-[11px] text-zinc-600 text-center">
          Free hub · Plus {PLUS_PRICE_MO} · Pro {PRO_PRICE_MO} · Not investment
          advice
        </p>
        <DisclaimerBanner />
      </main>
    </div>
  );
}
