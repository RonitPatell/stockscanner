"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PlatformGuide } from "../PlatformGuide";
import { OnboardingWizard } from "../OnboardingWizard";
import { OnboardingChecklist } from "../OnboardingChecklist";
import { LiveQuoteProvider } from "../LiveQuoteProvider";
import { FeedShortcutsHelpButton } from "../catalyst-feed/FeedShortcutsHelpButton";
import { FocusModeV2 } from "../focus/FocusModeV2";
import { DashboardTopBar } from "./DashboardTopBar";
import { DashboardSecondaryNav } from "./DashboardSecondaryNav";
import { CatalystContextDrawer } from "./CatalystContextDrawer";
import {
  destinationFromSearchParams,
  type DashboardDestination,
} from "@/lib/dashboard-shell";
import { isFocusModeV2Enabled } from "@/lib/focus-mode";
import {
  catalystIdFromSearchParams,
  writeCatalystDeepLink,
} from "@/lib/decision-drawer";
import Link from "next/link";

const MODE_KEY = "tt-dashboard-mode";
const FOCUS_V2 = isFocusModeV2Enabled();

function useDrawerMode(): "side" | "overlay" | "sheet" {
  const [mode, setMode] = useState<"side" | "overlay" | "sheet">("side");
  useEffect(() => {
    const mq = () => {
      const w = window.innerWidth;
      if (w < 768) setMode("sheet");
      else if (w < 1024) setMode("overlay");
      else setMode("side");
    };
    mq();
    window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, []);
  return mode;
}

export function DashboardShellV3({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
  initialScanner = null,
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
  initialScanner?: MarketScannerSnapshot | null;
}) {
  const [destination, setDestination] = useState<DashboardDestination>("feed");
  const [tab, setTab] = useState<ScannerTab>("all");
  const [mode, setMode] = useState<"focus" | "full">("focus");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalystItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(
    initialCatalysts.length ? new Date() : null
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const drawerMode = useDrawerMode();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "full" || saved === "advanced") setMode("full");
      else if (saved === "focus" || saved === "simple") setMode("focus");
    } catch {
      /* ignore */
    }

    try {
      const params = new URLSearchParams(window.location.search);
      setDestination(destinationFromSearchParams(params));
      if (params.get("focus") === "1") {
        setMode("focus");
        localStorage.setItem(MODE_KEY, "focus");
      }
      if (params.get("tab") === "watchlist") setTab("watchlist");
      if (params.get("tab") === "premarket") setTab("premarket");
      const deepId = catalystIdFromSearchParams(params);
      if (deepId) {
        const found = initialCatalysts.find((c) => c.id === deepId);
        if (found) {
          setSelected(found);
          setDrawerOpen(true);
          writeCatalystDeepLink(found.id);
        }
      }
      const muteSym = params.get("mute");
      if (muteSym && /^[A-Za-z]{1,5}$/.test(muteSym)) {
        const key = "tt-muted-symbols-v1";
        const prev = JSON.parse(localStorage.getItem(key) || "[]") as string[];
        localStorage.setItem(
          key,
          JSON.stringify([...new Set([...prev, muteSym.toUpperCase()])])
        );
      }
    } catch {
      /* ignore */
    }
  }, [initialCatalysts]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetch("/api/onboarding")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.showWizard) setShowOnboarding(true);
          if (d?.showChecklist) setShowChecklist(true);
        })
        .catch(() => {});
    }, 1_500);
    return () => clearTimeout(t);
  }, []);

  const navigate = useCallback((id: DashboardDestination) => {
    setDestination(id);
    setDrawerOpen(false);
    writeCatalystDeepLink(null);
    if (id === "watchlist") setTab("watchlist");
    if (id === "feed" && tab === "watchlist") setTab("all");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", id);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [tab]);

  const setDashboardMode = useCallback((next: "focus" | "full") => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const onFocusedCatalystChange = useCallback((c: CatalystItem | null) => {
    setSelected(c);
    // Keep drawer open on j/k; refresh deep-link when a selection exists
    if (c) {
      setDrawerOpen((open) => {
        if (open) {
          // Defer URL write — never side-effect inside setState updater
          queueMicrotask(() => writeCatalystDeepLink(c.id));
        }
        return open;
      });
    }
  }, []);

  const onLastEventAtChange = useCallback((d: Date | null) => {
    if (d) setLastEventAt(d);
  }, []);

  const openDrawerFor = useCallback((c: CatalystItem) => {
    setSelected(c);
    setDrawerOpen(true);
    writeCatalystDeepLink(c.id);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    writeCatalystDeepLink(null);
  }, []);

  const guideNavigate = useCallback(
    (step?: { id: string; target?: string }) => {
      const t = step?.target ?? "";
      if (t === "plan-destination" || t === "session-plan" || t === "daily-edge") {
        navigate("plan");
      } else if (t === "risk-destination" || t === "dilution-radar" || t === "market-monitor") {
        navigate("risk");
      } else {
        navigate("review");
      }
    },
    [navigate]
  );

  const focused = mode === "focus";
  const focusV2Active = FOCUS_V2 && focused;
  const feedTab: ScannerTab =
    destination === "watchlist" ? "watchlist" : tab;

  useEffect(() => {
    if (!focusV2Active) return;
    if (destination === "plan" || destination === "risk" || destination === "review") {
      setDestination("feed");
    }
  }, [focusV2Active, destination]);

  const filtersWithSearch = useMemo(() => {
    const base = initialFilters ?? {};
    if (!search.trim()) return base;
    return { ...base, search: search.trim() };
  }, [initialFilters, search]);

  const showSideDrawer =
    drawerOpen &&
    drawerMode === "side" &&
    (destination === "feed" || destination === "watchlist" || focusV2Active);

  return (
    <LiveQuoteProvider>
      <div
        className="dashboard-shell-v3 flex flex-col h-full min-h-0"
        data-shell="v3"
        data-destination={destination}
      >
        {showOnboarding && (
          <OnboardingWizard
            onComplete={() => {
              setShowOnboarding(false);
              setShowChecklist(true);
            }}
            onSkipped={() => setShowChecklist(true)}
          />
        )}
        {!showOnboarding && (
          <OnboardingChecklist
            forceShow={showChecklist}
            onResume={() => {
              setShowOnboarding(true);
              setShowChecklist(false);
            }}
          />
        )}

        <DashboardTopBar
          lastEventAt={lastEventAt}
          searchValue={search}
          onSearchChange={setSearch}
        />
        <DashboardSecondaryNav
          active={destination}
          onChange={navigate}
          hiddenIds={
            focusV2Active ? ["plan", "risk", "review"] : undefined
          }
        />

        {/* Single page-level scroll — no left feature column */}
        <div className="flex-1 min-h-0 flex max-w-[1680px] w-full mx-auto">
          <main
            className="flex-1 min-w-0 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 space-y-3"
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
              <section data-guide="news-feed" className="desk-panel desk-panel--raised flex flex-col min-h-[70vh]">
                <div className="desk-panel-header shrink-0 flex items-center gap-2 px-3 py-2">
                  <span className="desk-label">Feed</span>
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
                <LiveScanner
                  embedded
                  tab={feedTab}
                  onTabChange={setTab}
                  initialCatalysts={initialCatalysts}
                  initialWatchlist={initialWatchlist}
                  initialFilters={filtersWithSearch}
                  focusCompact={focused}
                  onFocusedCatalystChange={onFocusedCatalystChange}
                  onLastEventAtChange={onLastEventAtChange}
                  onCatalystActivate={openDrawerFor}
                  focusCatalystId={drawerOpen ? selected?.id ?? null : null}
                />
              </section>
            )}

            {!focusV2Active && destination === "watchlist" && (
              <section
                data-guide="watchlist-destination"
                className="space-y-3"
              >
                <WatchlistBrief />
                <section data-guide="news-feed" className="desk-panel desk-panel--raised flex flex-col min-h-[60vh]">
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
                    onFocusedCatalystChange={onFocusedCatalystChange}
                    onLastEventAtChange={onLastEventAtChange}
                    onCatalystActivate={openDrawerFor}
                    focusCatalystId={drawerOpen ? selected?.id ?? null : null}
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
                  <MarketMonitor className="h-full min-h-[300px]" initialSnapshot={initialScanner} />
                </div>
                <SympathyMapPanel seedSymbol={initialWatchlist[0]} />
              </section>
            )}

            {!focusV2Active && destination === "review" && (
              <section
                data-guide="review-destination"
                className="space-y-4 max-w-3xl"
              >
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

          {showSideDrawer && (
            <CatalystContextDrawer
              catalyst={selected}
              open={drawerOpen}
              onClose={closeDrawer}
              mode="side"
            />
          )}
        </div>

        {drawerOpen && drawerMode !== "side" && (
          <CatalystContextDrawer
            catalyst={selected}
            open={drawerOpen}
            onClose={closeDrawer}
            mode={drawerMode}
          />
        )}

        {/* Keep closed marker mounted for guide target uniqueness tests on feed */}
        {!drawerOpen && (
          <CatalystContextDrawer
            catalyst={null}
            open={false}
            onClose={() => {}}
            mode="side"
          />
        )}

        <PlatformGuide surface="dashboard" onExtrasRequired={guideNavigate} />
      </div>
    </LiveQuoteProvider>
  );
}
