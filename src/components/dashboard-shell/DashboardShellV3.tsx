"use client";

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CatalystItem, MarketScannerSnapshot, ScannerFilters } from "@/types";
import type { ScannerTab } from "../LiveScanner";
import { PlatformGuide } from "../PlatformGuide";
import { OnboardingWizard } from "../OnboardingWizard";
import { OnboardingChecklist } from "../OnboardingChecklist";
import { LiveQuoteProvider } from "../LiveQuoteProvider";
import { DashboardTopBar } from "./DashboardTopBar";
import { DashboardPanelBar } from "./DashboardPanelBar";
import { CatalystContextDrawer } from "./CatalystContextDrawer";
import { TradingFloor } from "./TradingFloor";
import { ResearchDesk } from "./ResearchDesk";
import { WatchtowerDesk } from "./WatchtowerDesk";
import { DiscoverDesk } from "./DiscoverDesk";
import { ModulePaywall } from "./ModulePaywall";
import type { DashboardDestination } from "@/lib/dashboard-shell";
import type { PlanTier } from "@/lib/subscription";
import { isFocusModeV2Enabled } from "@/lib/focus-mode";
import { isMonitorV1Enabled } from "@/lib/monitor";
import { MonitorBetaChrome } from "../monitor/MonitorBetaChrome";
import { MonitorLoadingSkeleton } from "../monitor/states/MonitorLoadingSkeleton";
import {
  catalystIdFromSearchParams,
  writeCatalystDeepLink,
} from "@/lib/decision-drawer";
import type { MonitorInitialSnapshot } from "@/lib/monitor/ssr";
import Link from "next/link";
import {
  DEFAULT_DESK_MODE,
  DESK_MODE_META,
  loadDeskMode,
  modeFromLegacyView,
  saveDeskMode,
  viewParamForDeskMode,
  type DeskModeId,
} from "@/lib/dashboard-shell/panel-prefs";

const MODE_KEY = "tt-dashboard-mode";
const FOCUS_V2 = isFocusModeV2Enabled();

const TrustTickerMonitor = lazy(async () => {
  const m = await import("../monitor/TrustTickerMonitor");
  return { default: m.TrustTickerMonitor };
});

const DashboardNonMonitorBody = lazy(async () => {
  const m = await import("./DashboardNonMonitorBody");
  return { default: m.DashboardNonMonitorBody };
});

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

function ModeSection({
  id,
  children,
}: {
  id: DeskModeId;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={`desk-panel-${id}`}
      data-guide={
        id === "watchlist"
          ? "watchlist-destination"
          : id === "watchtower"
            ? "watchtower-desk"
            : id === "research"
              ? "research-desk"
              : id === "discover"
                ? "discover-desk"
                : id === "floor"
                  ? "trading-floor"
                  : id === "structure"
                    ? "structure-desk"
                    : undefined
      }
      className="desk-panel border-b border-[var(--border)] min-w-0 min-h-0 flex-1 flex flex-col"
    >
      {id !== "floor" && id !== "watchtower" ? (
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-4 py-1.5 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]/60 shrink-0">
          <div className="min-w-0 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
              {DESK_MODE_META[id].label}
            </h2>
            <p className="text-[11px] text-zinc-500 truncate hidden md:block">
              {DESK_MODE_META[id].description}
            </p>
          </div>
        </header>
      ) : null}
      <div className="min-h-0 flex-1 flex flex-col">{children}</div>
    </section>
  );
}

function SectionFallback({ label }: { label: string }) {
  return (
    <div
      className="p-4 text-sm text-zinc-500"
      data-testid="desk-destination-skeleton"
      aria-busy="true"
    >
      Loading {label}…
    </div>
  );
}

export function DashboardShellV3({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
  initialScanner = null,
  initialDestination,
  initialMonitorSnapshot = null,
  planTier = "free",
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
  initialScanner?: MarketScannerSnapshot | null;
  initialDestination?: DashboardDestination;
  initialMonitorSnapshot?: MonitorInitialSnapshot | null;
  planTier?: PlanTier;
}) {
  const canUseMarkets = planTier === "pro";
  const canUseStructure = planTier === "pro";
  const [deskMode, setDeskMode] = useState<DeskModeId>(DEFAULT_DESK_MODE);
  const [tab, setTab] = useState<ScannerTab>("all");
  const [mode, setMode] = useState<"focus" | "full">("full");
  const [search, setSearch] = useState("");
  const [floorLookup, setFloorLookup] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalystItem | null>(
    () => initialCatalysts[0] ?? null
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(
    initialCatalysts.length ? new Date() : null
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [monitorEnabled, setMonitorEnabled] = useState(isMonitorV1Enabled());
  const drawerMode = useDrawerMode();
  const selectedIdRef = useRef<string | null>(
    initialCatalysts[0]?.id ?? null
  );

  useEffect(() => {
    // Product default is Portfolio unless an explicit deep link says otherwise.
    let next: DeskModeId = DEFAULT_DESK_MODE;
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get("view");
      const fromView = modeFromLegacyView(
        viewParam ?? initialDestination ?? null
      );
      if (fromView) {
        next = fromView;
      } else {
        const saved = loadDeskMode();
        // Never reopen retired News tab from old prefs
        next = saved === "news" ? "floor" : saved;
      }
      if (params.get("focus") === "1") {
        setMode("focus");
        localStorage.setItem(MODE_KEY, "focus");
        next = "floor";
      }
      if (params.get("tab") === "watchlist") {
        setTab("watchlist");
        next = "watchlist";
      }
      if (params.get("tab") === "premarket") setTab("premarket");

      const savedMode = localStorage.getItem(MODE_KEY);
      if (savedMode === "full" || savedMode === "advanced") setMode("full");
      else if (savedMode === "focus" || savedMode === "simple") setMode("focus");

      const deepId = catalystIdFromSearchParams(params);
      if (deepId) {
        const found = initialCatalysts.find((c) => c.id === deepId);
        if (found) {
          selectedIdRef.current = found.id;
          setSelected(found);
          setDrawerOpen(true);
          writeCatalystDeepLink(found.id);
          next = "floor";
        }
      } else if (!selected && initialCatalysts[0]) {
        selectedIdRef.current = initialCatalysts[0].id;
        setSelected(initialCatalysts[0]);
      }
    } catch {
      /* ignore */
    }
    if (next === "news") next = "floor";
    setDeskMode(next);
    saveDeskMode(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount hydrate only
  }, [initialCatalysts, initialDestination]);

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

  const selectMode = useCallback((id: DeskModeId) => {
    const next = id === "news" ? "floor" : id;
    setDeskMode(next);
    saveDeskMode(next);
    if (next === "watchlist") setTab("watchlist");
    if (
      next === "floor" ||
      next === "structure" ||
      next === "research" ||
      next === "watchtower" ||
      next === "discover"
    ) {
      setTab("all");
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", viewParamForDeskMode(next));
      if (next !== "watchtower") {
        url.searchParams.delete("eventId");
        url.searchParams.delete("weid");
        url.searchParams.delete("companyEventId");
      }
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const setDashboardMode = useCallback((next: "focus" | "full") => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
    if (next === "focus") selectMode("floor");
  }, [selectMode]);

  const navigate = useCallback(
    (id: DashboardDestination) => {
      const map: Record<DashboardDestination, DeskModeId> = {
        monitor: "scanner",
        feed: "floor",
        watchlist: "watchlist",
        plan: "watchlist",
        risk: "structure",
        review: "watchlist",
      };
      selectMode(map[id]);
    },
    [selectMode]
  );

  useEffect(() => {
    const onOpenWatchlist = () => navigate("watchlist");
    window.addEventListener("tt-open-watchlist-panel", onOpenWatchlist);
    return () =>
      window.removeEventListener("tt-open-watchlist-panel", onOpenWatchlist);
  }, [navigate]);

  const onFocusedCatalystChange = useCallback((c: CatalystItem | null) => {
    const id = c?.id ?? null;
    // Hard bail — even Object.is-equal setState was retriggering LiveScanner.
    if (selectedIdRef.current === id) return;
    selectedIdRef.current = id;
    setSelected(c);
  }, []);

  const onLastEventAtChange = useCallback((d: Date | null) => {
    if (d) setLastEventAt(d);
  }, []);

  const openDrawerFor = useCallback((c: CatalystItem) => {
    if (selectedIdRef.current !== c.id) {
      selectedIdRef.current = c.id;
      setSelected(c);
    }
    setDrawerOpen(true);
    writeCatalystDeepLink(c.id);
  }, []);

  const selectForChart = useCallback((c: CatalystItem) => {
    if (selectedIdRef.current === c.id) return;
    selectedIdRef.current = c.id;
    setSelected(c);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    writeCatalystDeepLink(null);
  }, []);

  const guideNavigate = useCallback(
    (step?: { id: string; target?: string }) => {
      const t = step?.target ?? "";
      if (t.startsWith("monitor-") || t === "monitor-beta-chrome") {
        navigate("monitor");
      } else if (
        t === "trading-floor" ||
        t === "floor-movers" ||
        t === "floor-wire" ||
        t === "floor-gappers"
      ) {
        selectMode("floor");
      } else if (t === "watchlist-destination") {
        navigate("watchlist");
      } else if (t === "watchtower-desk" || t === "watchtower-event-drawer") {
        selectMode("watchtower");
      } else if (t === "research-desk") {
        selectMode("research");
      } else if (t === "discover-desk") {
        selectMode("discover");
      } else if (
        t === "dilution-radar" ||
        t === "risk-destination" ||
        t === "market-monitor" ||
        t === "structure-desk"
      ) {
        selectMode("structure");
      } else if (t === "news-feed" || t === "live-tape-chart") {
        selectMode("floor");
      } else {
        navigate("feed");
      }
    },
    [navigate, selectMode]
  );

  const focused = mode === "focus";
  const focusV2Active = FOCUS_V2 && focused;
  const feedTab: ScannerTab =
    deskMode === "watchlist" || tab === "watchlist" ? "watchlist" : tab;

  useEffect(() => {
    if (!focusV2Active) return;
    if (deskMode !== "floor" && deskMode !== "watchlist") selectMode("floor");
  }, [focusV2Active, deskMode, selectMode]);

  useEffect(() => {
    if (!monitorEnabled && deskMode === "scanner") {
      selectMode("floor");
    }
  }, [monitorEnabled, deskMode, selectMode]);

  // On Floor, search loads a ticker — do not filter the news tape.
  const filtersWithSearch = useMemo(() => {
    const base = initialFilters ?? {};
    if (deskMode === "floor") return base;
    if (!search.trim()) return base;
    return { ...base, search: search.trim() };
  }, [initialFilters, search, deskMode]);

  const submitSearch = useCallback(
    (raw: string) => {
      const token = raw.trim().toUpperCase().replace(/^\$/, "");
      const sym = token.split(/\s+/)[0] ?? "";
      if (!sym) return;
      if (deskMode === "floor" || /^[A-Z]{1,5}$/.test(sym)) {
        selectMode("floor");
        setFloorLookup(sym);
        setSearch(sym);
        return;
      }
      // Stay on Floor — session news already lives there
      selectMode("floor");
      setSearch(raw.trim());
    },
    [deskMode, selectMode]
  );

  const showSideDrawer =
    drawerOpen &&
    drawerMode === "side" &&
    (deskMode === "floor" ||
      deskMode === "news" ||
      deskMode === "watchlist" ||
      focusV2Active);

  const nonMonitorProps = {
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
  };

  return (
    <LiveQuoteProvider>
      <div
        className="dashboard-shell-v3 flex flex-col h-full min-h-0"
        data-shell="v3"
        data-layout="exclusive-modes"
        data-desk-mode={deskMode}
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
          onSearchSubmit={submitSearch}
          searchPlaceholder={
            deskMode === "floor"
              ? "Search any ticker — float, mcap, chart"
              : "Search ticker or headline"
          }
        />
        <DashboardPanelBar mode={deskMode} onSelect={selectMode} />

        <div className="flex-1 min-h-0 flex w-full">
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
            {deskMode === "floor" ? (
              <ModeSection id="floor">
                {canUseMarkets ? (
                  <TradingFloor
                    initialScanner={initialScanner}
                    initialCatalysts={initialCatalysts}
                    lookupSymbol={floorLookup}
                    onLookupHandled={() => setFloorLookup(null)}
                    onSymbolSelect={(symbol, catalyst) => {
                      if (catalyst) {
                        onFocusedCatalystChange(catalyst);
                      } else {
                        const id = `floor-${symbol}`;
                        if (selectedIdRef.current !== id) {
                          selectedIdRef.current = id;
                          setSelected({
                            id,
                            symbol,
                            headline: symbol,
                            source: "floor",
                            publishedAt: new Date().toISOString(),
                          });
                        }
                      }
                      setLastEventAt(new Date());
                    }}
                  />
                ) : (
                  <ModulePaywall
                    title="Markets requires TrustTicker access"
                    body="Live movers, wire, and charts unlock with a trial or paid subscription."
                  />
                )}
              </ModeSection>
            ) : null}

            {deskMode === "research" ? (
              <ModeSection id="research">
                <div className="max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-4">
                  <ResearchDesk seedSymbols={initialWatchlist} />
                </div>
              </ModeSection>
            ) : null}

            {deskMode === "watchtower" ? (
              <ModeSection id="watchtower">
                <WatchtowerDesk />
              </ModeSection>
            ) : null}

            {deskMode === "discover" ? (
              <ModeSection id="discover">
                <div className="max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-4">
                  <DiscoverDesk />
                </div>
              </ModeSection>
            ) : null}

            {deskMode === "structure" ? (
              <ModeSection id="structure">
                {canUseStructure ? (
                  <div className="max-w-[1680px] w-full mx-auto min-h-[380px] px-3 sm:px-4 py-3">
                    <header className="mb-4 max-w-3xl" data-guide="structure-desk">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-1">
                        Structure Desk
                      </p>
                      <h2 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-zinc-100">
                        Can new supply crush this move?
                      </h2>
                      <p className="mt-1.5 text-[13px] text-zinc-400 max-w-xl leading-relaxed">
                        Dilution Radar reads SEC capital filings first. Use it to
                        skip offering traps before you chase volume. Informational
                        only.
                      </p>
                    </header>
                    <Suspense fallback={<SectionFallback label="Structure" />}>
                      <DashboardNonMonitorBody
                        {...nonMonitorProps}
                        destination="risk"
                      />
                    </Suspense>
                  </div>
                ) : (
                  <ModulePaywall
                    title="Structure requires TrustTicker access"
                    body="Dilution Radar and capital-risk tools unlock with a trial or paid subscription."
                  />
                )}
              </ModeSection>
            ) : null}

            {deskMode === "news" ? (
              <ModeSection id="news">
                <div className="max-w-[1680px] w-full mx-auto min-h-[380px]">
                  <Suspense fallback={<SectionFallback label="News" />}>
                    <DashboardNonMonitorBody
                      {...nonMonitorProps}
                      destination="feed"
                    />
                  </Suspense>
                </div>
              </ModeSection>
            ) : null}

            {deskMode === "watchlist" ? (
              <ModeSection id="watchlist">
                <div className="max-w-[1680px] w-full mx-auto min-h-[320px]">
                  <Suspense fallback={<SectionFallback label="Watchlist" />}>
                    <DashboardNonMonitorBody
                      {...nonMonitorProps}
                      destination="watchlist"
                    />
                  </Suspense>
                </div>
              </ModeSection>
            ) : null}

            {deskMode === "scanner" ? (
              <ModeSection id="scanner">
                <div className="flex flex-col min-w-0">
                  <div
                    className="min-h-[min(72vh,820px)] h-[min(72vh,820px)] max-h-[min(72vh,820px)] flex flex-col min-w-0 overflow-hidden relative z-0"
                    data-testid="monitor-root"
                  >
                    <div className="shrink-0">
                      <MonitorBetaChrome onAccessChange={setMonitorEnabled} />
                    </div>
                    {monitorEnabled ? (
                      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                        <Suspense fallback={<MonitorLoadingSkeleton />}>
                          <TrustTickerMonitor
                            initialSnapshot={initialMonitorSnapshot}
                          />
                        </Suspense>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 p-6 text-sm text-zinc-400 space-y-3 overflow-auto">
                        <p>
                          Advanced Scanner is not active for your account.
                          Switch back to Floor above, or open the old
                          dashboard.
                        </p>
                        <Link
                          href="/dashboard?shell=legacy"
                          className="text-sky-400/90 underline-offset-2 hover:underline"
                        >
                          Old dashboard
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </ModeSection>
            ) : null}
          </div>

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
