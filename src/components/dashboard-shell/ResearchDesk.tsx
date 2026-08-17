"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseTickerTab, type TickerTabId } from "@/lib/ticker-tabs";
import {
  loadResearchRecent,
  pushResearchRecent,
} from "@/lib/research/recent";
import { ResearchWorkspaceTabs } from "@/components/research/ResearchWorkspaceTabs";
import { ResearchTabPanels } from "@/components/research/ResearchTabPanels";
import { ResearchPersonalizedGate } from "@/components/research/ResearchPersonalizedGate";

/**
 * In-desk Research workspace — search, recents, monitored, company tabs.
 * Public /ticker/[symbol] remains the SEO/discovery surface.
 */
export function ResearchDesk({
  seedSymbols = [],
  entitled = false,
  accessState = "expired",
}: {
  seedSymbols?: string[];
  /** True when session has TrustTicker access (trial/active). */
  entitled?: boolean;
  accessState?: import("@/lib/subscription").AccessState;
}) {
  const [q, setQ] = useState("");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [tab, setTab] = useState<TickerTabId>("overview");
  const [recent, setRecent] = useState<string[]>([]);
  const [monitored, setMonitored] = useState<string[]>(seedSymbols);
  const [showSubscribeHint, setShowSubscribeHint] = useState(false);

  const openSymbol = useCallback(
    (raw: string, nextTab: TickerTabId = "overview") => {
      const sym = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
      if (!sym) return;
      setSymbol(sym);
      setTab(nextTab);
      setRecent(pushResearchRecent(sym));
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "research");
        url.searchParams.set("symbol", sym);
        if (nextTab === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", nextTab);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    },
    []
  );

  useEffect(() => {
    setRecent(loadResearchRecent());
    try {
      const params = new URLSearchParams(window.location.search);
      const deep = params.get("symbol");
      if (deep) {
        openSymbol(deep, parseTickerTab(params.get("tab")));
      }
    } catch {
      /* ignore */
    }
  }, [openSymbol]);

  useEffect(() => {
    if (!symbol || !entitled) return;
    void fetch(`/api/research/${encodeURIComponent(symbol)}/readiness`, {
      credentials: "include",
    }).catch(() => {});
  }, [symbol, entitled]);

  useEffect(() => {
    if (!entitled) {
      setMonitored(seedSymbols);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portfolio", { credentials: "include" });
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) return;
        const data = (await res.json()) as {
          items?: Array<{ symbol: string }>;
        };
        if (!cancelled && Array.isArray(data.items)) {
          setMonitored(data.items.map((i) => i.symbol.toUpperCase()));
        }
      } catch {
        /* keep seed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entitled, seedSymbols]);

  const draft = q.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);

  function selectTab(next: TickerTabId) {
    setTab(next);
    if (symbol) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "research");
        url.searchParams.set("symbol", symbol);
        if (next === "overview") url.searchParams.delete("tab");
        else url.searchParams.set("tab", next);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <section
      data-guide="research-desk"
      data-testid="research-desk"
      className="space-y-5"
    >
      <header className="max-w-3xl">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-1">
          Research
        </p>
        <h2 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-zinc-100">
          Company research workspace
        </h2>
        <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
          Search any US symbol. Stay in the desk for Overview, What Changed,
          Thesis, Financials, Capital, Insiders, Ownership, Filings, and
          Timeline. Informational only.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside
          className="space-y-4 lg:sticky lg:top-3 lg:self-start"
          data-testid="research-rail"
        >
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.length >= 1) openSymbol(draft);
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker"
                maxLength={5}
                className="w-full h-9 pl-8 pr-2 rounded-md border border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                data-testid="research-ticker-input"
                aria-label="Research ticker"
              />
            </div>
            <Button type="submit" size="sm" disabled={draft.length < 1}>
              Open
            </Button>
          </form>

          <RailList
            title="Recently viewed"
            testId="research-recent"
            symbols={recent}
            active={symbol}
            onSelect={(s) => openSymbol(s)}
            empty="Symbols you open appear here."
          />

          <RailList
            title="Monitored"
            testId="research-monitored"
            symbols={monitored}
            active={symbol}
            onSelect={(s) => {
              if (!entitled) {
                setShowSubscribeHint(true);
                openSymbol(s);
                return;
              }
              openSymbol(s);
            }}
            empty={
              entitled
                ? "Add companies in Portfolio to pin them here."
                : "Active plan required to monitor companies."
            }
          />

          {showSubscribeHint && !entitled ? (
            <ResearchPersonalizedGate
              state={accessState === "trial_eligible" ? "trial_eligible" : "expired"}
              nextPath="/dashboard?view=research"
              feature="Research"
            />
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4" data-testid="research-company-workspace">
          {!symbol ? (
            <div className="desk-panel desk-panel--raised p-5 text-[13px] text-zinc-400">
              Open a ticker to load the company workspace. Public ticker pages
              remain available for discovery and SEO.
            </div>
          ) : (
            <>
              <ResearchWorkspaceTabs active={tab} onSelect={selectTab} />
              <ResearchTabPanels
                symbol={symbol}
                tab={tab}
                entitled={entitled}
                accessState={accessState}
                onOpenTab={selectTab}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function RailList({
  title,
  testId,
  symbols,
  active,
  onSelect,
  empty,
}: {
  title: string;
  testId: string;
  symbols: string[];
  active: string | null;
  onSelect: (s: string) => void;
  empty: string;
}) {
  return (
    <div data-testid={testId}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
        {title}
      </p>
      {symbols.length === 0 ? (
        <p className="text-[11px] text-zinc-600 leading-relaxed">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {symbols.slice(0, 24).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelect(s)}
              className={
                active === s
                  ? "font-mono text-[12px] px-2 py-1 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "font-mono text-[12px] px-2 py-1 rounded border border-zinc-800 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
              }
              data-testid={`${testId}-chip-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
