"use client";

/**
 * Feed / Plan / Risk / Review destinations — code-split from the Monitor path.
 * Do not import this from the Monitor critical bundle entry.
 */

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Layers } from "lucide-react";
import type { CatalystItem, MarketScannerSnapshot, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "../LiveScanner";
import { WatchlistBrief } from "../WatchlistBrief";
import { PremarketCenter } from "../PremarketCenter";
import { SessionRecap } from "../SessionRecap";
import { SpeedWinsPanel } from "../SpeedWinsPanel";
import { SpeedEdgeLedger } from "../SpeedEdgeLedger";
import { DilutionRadar } from "../DilutionRadar";
import { GreenLedger } from "../GreenLedger";
import { TraderFeedbackPanel } from "../trader-feedback/TraderFeedbackPanel";
import { WatchlistAutopsy } from "../WatchlistAutopsy";
import { SessionPlanCard } from "../SessionPlanCard";
import { PaperTradeLedger } from "../PaperTradeLedger";
import { SympathyMapPanel } from "../SympathyMapPanel";
import { CatalystReplayPanel } from "../CatalystReplayPanel";
import { DailyEdgeRecap } from "../DailyEdgeRecap";
import { SpeedBacktestPanel } from "../SpeedBacktestPanel";
import { CallBoard } from "../CallBoard";
import { CatchesBoard } from "../CatchesBoard";
import { AlertSetupNudge } from "../AlertSetupNudge";
import { MarketMonitor } from "../MarketMonitor";
import { HelpTip } from "../HelpTip";
import { FeedShortcutsHelpButton } from "../catalyst-feed/FeedShortcutsHelpButton";
import { FocusModeV2 } from "../focus/FocusModeV2";
import { SelectedTapeChart } from "../SelectedTapeChart";
import type { DashboardDestination } from "@/lib/dashboard-shell";

export type DashboardNonMonitorBodyProps = {
  destination: Exclude<DashboardDestination, "monitor">;
  focused: boolean;
  focusV2Active: boolean;
  tab: ScannerTab;
  setTab: (t: ScannerTab) => void;
  setDashboardMode: (m: "focus" | "full") => void;
  navigate: (id: DashboardDestination) => void;
  search: string;
  setSearch: (v: string) => void;
  selected: CatalystItem | null;
  drawerOpen: boolean;
  initialCatalysts: CatalystItem[];
  initialWatchlist: string[];
  filtersWithSearch: ScannerFilters | null;
  initialScanner: MarketScannerSnapshot | null;
  openDrawerFor: (c: CatalystItem) => void;
  onFocusedCatalystChange: (c: CatalystItem | null) => void;
  onLastEventAtChange: (d: Date | null) => void;
  selectForChart: (c: CatalystItem) => void;
  feedTab: ScannerTab;
};

export function DashboardNonMonitorBody(props: DashboardNonMonitorBodyProps) {
  const {
    destination,
    focused,
    focusV2Active,
    tab,
    setTab,
    setDashboardMode,
    navigate,
    search,
    setSearch,
    selected,
    drawerOpen,
    initialCatalysts,
    initialWatchlist,
    filtersWithSearch,
    initialScanner,
    openDrawerFor,
    onFocusedCatalystChange,
    onLastEventAtChange,
    selectForChart,
    feedTab,
  } = props;

  useEffect(() => {
    // Chart script only when a non-Monitor desk is active.
    void import("../TradingViewMiniChart").then((m) =>
      m.prefetchTradingViewScript?.()
    );
  }, []);

  // Focus updates already set `selected` in the shell — do not also call
  // selectForChart here (double setState + focusCatalystId sync looped).
  const handleFocusedCatalystChange = onFocusedCatalystChange;

  return (
    <main
      className="flex-1 min-w-0 min-h-0 overflow-visible px-3 sm:px-4 py-3 space-y-3"
      data-testid="dashboard-main-scroll"
    >
      {(destination === "feed" || destination === "watchlist") && !focusV2Active && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="desk-seg desk-command-mode"
              role="group"
              aria-label="Feed density"
            >
              <button
                type="button"
                data-active={focused}
                data-testid="mode-focus"
                onClick={() => setDashboardMode("focus")}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Focus
              </button>
              <button
                type="button"
                data-active={!focused}
                data-testid="mode-full"
                onClick={() => setDashboardMode("full")}
              >
                <Layers className="w-3.5 h-3.5" />
                Standard
              </button>
            </div>
            <HelpTip title="Focus Mode">
              Focus keeps at most five priority catalysts — materiality,
              reaction, tradeability, and risk — not predicted profit.
            </HelpTip>
            <FeedShortcutsHelpButton className="ml-auto" />
          </div>
          <AlertSetupNudge />
        </>
      )}

      {focusV2Active && (
        <FocusModeV2
          initialCatalysts={initialCatalysts}
          initialWatchlist={initialWatchlist}
          initialFilters={filtersWithSearch}
          searchValue={search}
          onSearchChange={setSearch}
          onExitFocus={() => setDashboardMode("full")}
          onCatalystActivate={openDrawerFor}
          onFocusedCatalystChange={onFocusedCatalystChange}
          onLastEventAtChange={onLastEventAtChange}
          focusCatalystId={drawerOpen ? selected?.id ?? null : null}
          onShowAllNews={() => {
            setDashboardMode("full");
            navigate("feed");
          }}
          onEditFocusRules={() => {
            window.location.href = "/settings#alert-strategies";
          }}
          onReviewWatchlist={() => {
            setDashboardMode("full");
            navigate("watchlist");
          }}
        />
      )}

      {!focusV2Active && destination === "feed" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)] gap-3 items-stretch min-h-[min(72vh,820px)]">
          <section
            data-guide="live-tape-chart"
            className="desk-panel desk-panel--raised flex flex-col min-h-[420px]"
          >
            <div className="desk-panel-header shrink-0 flex items-center gap-2 px-3 py-2">
              <span className="desk-label">Chart</span>
              <span className="text-[10px] text-[var(--text-muted)]">
                Scroll / pinch to zoom · click a headline to load the ticker
              </span>
            </div>
            <div className="p-2 flex-1 min-h-0 flex flex-col">
              {selected ? (
                <SelectedTapeChart
                  symbol={selected.symbol}
                  headline={selected.headline}
                  onOpenDetails={() => openDrawerFor(selected)}
                  height={520}
                  className="flex-1"
                />
              ) : (
                <p className="px-2 py-6 text-center text-[12px] text-[var(--text-muted)]">
                  Select a news row to open its chart
                </p>
              )}
            </div>
          </section>

          <section
            data-guide="news-feed"
            className="desk-panel desk-panel--raised flex flex-col min-h-[60vh] xl:min-h-0 xl:max-h-[min(72vh,820px)]"
          >
            <div className="desk-panel-header shrink-0 flex items-center gap-2 px-3 py-2">
              <span className="desk-label">News</span>
              <div className="flex gap-1 ml-auto items-center">
                {(
                  [
                    ["all", "All"],
                    ["premarket", "Premarket"],
                    ["watchlist", "Watchlist"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    data-active={tab === id}
                    className="desk-feed-tab"
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <LiveScanner
                embedded
                tab={feedTab}
                onTabChange={setTab}
                initialCatalysts={initialCatalysts}
                initialWatchlist={initialWatchlist}
                initialFilters={filtersWithSearch}
                focusCompact={focused}
                onFocusedCatalystChange={handleFocusedCatalystChange}
                onLastEventAtChange={onLastEventAtChange}
                onCatalystActivate={openDrawerFor}
                focusCatalystId={selected?.id ?? null}
              />
            </div>
          </section>
        </div>
      )}

      {!focusV2Active && destination === "watchlist" && (
        <section data-guide="watchlist-destination" className="space-y-3">
          <WatchlistBrief />
          <section
            data-guide="live-tape-chart"
            className="desk-panel desk-panel--raised"
          >
            <div className="desk-panel-header px-3 py-2">
              <span className="desk-label">Chart</span>
            </div>
            <div className="p-2">
              {selected ? (
                <SelectedTapeChart
                  symbol={selected.symbol}
                  headline={selected.headline}
                  onOpenDetails={() => openDrawerFor(selected)}
                />
              ) : (
                <p className="px-2 py-6 text-center text-[12px] text-[var(--text-muted)]">
                  Select a watchlist row to open its chart
                </p>
              )}
            </div>
          </section>
          <section
            data-guide="news-feed"
            className="desk-panel desk-panel--raised flex flex-col min-h-[60vh]"
          >
            <div className="desk-panel-header px-3 py-2">
              <span className="desk-label">Watchlist feed</span>
            </div>
            <LiveScanner
              embedded
              tab="watchlist"
              onTabChange={setTab}
              initialCatalysts={initialCatalysts}
              initialWatchlist={initialWatchlist}
              initialFilters={filtersWithSearch}
              focusCompact={focused}
              onFocusedCatalystChange={handleFocusedCatalystChange}
              onLastEventAtChange={onLastEventAtChange}
              onCatalystActivate={openDrawerFor}
              focusCatalystId={selected?.id ?? null}
            />
          </section>
          <WatchlistAutopsy symbols={initialWatchlist} />
        </section>
      )}

      {!focusV2Active && destination === "plan" && (
        <section data-guide="plan-destination" className="space-y-4 max-w-3xl">
          <div data-guide="session-plan">
            <SessionPlanCard />
          </div>
          <p className="text-[12px] text-[--text-secondary]">
            Full daily plan page:{" "}
            <Link href="/today" className="text-emerald-400 underline">
              /today
            </Link>
          </p>
          <div data-guide="daily-edge">
            <DailyEdgeRecap />
          </div>
          <SessionRecap />
          {!focused && <PremarketCenter />}
        </section>
      )}

      {!focusV2Active && destination === "risk" && (
        <section data-guide="risk-destination" className="space-y-4 max-w-3xl">
          <div data-guide="dilution-radar">
            <DilutionRadar />
          </div>
          <p className="text-[12px] text-[--text-secondary]">
            Halt code reference:{" "}
            <Link href="/halt-codes" className="text-emerald-400 underline">
              /halt-codes
            </Link>
            . Official halt status appears on Decision Cards when configured.
          </p>
          <div data-guide="market-monitor" className="min-h-[320px]">
            <div className="desk-label px-1 pb-1">Wire &amp; volume</div>
            <MarketMonitor
              className="h-full min-h-[300px]"
              initialSnapshot={initialScanner}
            />
          </div>
          <SympathyMapPanel seedSymbol={initialWatchlist[0]} />
        </section>
      )}

      {!focusV2Active && destination === "review" && (
        <section data-guide="review-destination" className="space-y-4 max-w-3xl">
          <div data-guide="skip-ledger">
            <GreenLedger />
          </div>
          <TraderFeedbackPanel />
          <PaperTradeLedger />
          <div data-guide="wins-brief">
            <SpeedWinsPanel showViewAll title="Speed wins" />
          </div>
          <div data-guide="catches-board">
            <CatchesBoard />
          </div>
          <div data-guide="call-board">
            <CallBoard />
          </div>
          <CatalystReplayPanel />
          <SpeedBacktestPanel />
          <SpeedEdgeLedger />
        </section>
      )}

      <p className="desk-disclaimer text-[10px] text-[--text-muted] text-center pb-4">
        Not financial advice · informational only · TrustTicker does not
        execute orders
      </p>
    </main>
  );
}
