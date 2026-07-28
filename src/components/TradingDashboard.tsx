"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sun,
  Star,
  Radio,
  LayoutDashboard,
  Sparkles,
  Layers,
  ChevronDown,
} from "lucide-react";
import type { CatalystItem, MarketScannerSnapshot, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "./LiveScanner";
import { WatchlistBrief } from "./WatchlistBrief";
import { TrustStatusBar } from "./TrustStatusBar";
import { LiveConnectionStatus } from "./LiveConnectionStatus";
import { PremarketCenter } from "./PremarketCenter";
import { OnboardingWizard } from "./OnboardingWizard";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { SessionRecap } from "./SessionRecap";
import { SpeedWinsPanel } from "./SpeedWinsPanel";
import { SpeedEdgeLedger } from "./SpeedEdgeLedger";
import { DilutionRadar } from "./DilutionRadar";
import { GreenLedger } from "./GreenLedger";
import { TraderFeedbackPanel } from "./trader-feedback/TraderFeedbackPanel";
import { WatchlistAutopsy } from "./WatchlistAutopsy";
import { SessionPlanCard } from "./SessionPlanCard";
import { PaperTradeLedger } from "./PaperTradeLedger";
import { SympathyMapPanel } from "./SympathyMapPanel";
import { CatalystReplayPanel } from "./CatalystReplayPanel";
import { DailyEdgeRecap } from "./DailyEdgeRecap";
import { SpeedBacktestPanel } from "./SpeedBacktestPanel";
import { CallBoard } from "./CallBoard";
import { CatchesBoard } from "./CatchesBoard";
import { AlertSetupNudge } from "./AlertSetupNudge";
import { LiveQuoteProvider } from "./LiveQuoteProvider";
import { MarketMonitor } from "./MarketMonitor";
import { PlatformGuide } from "./PlatformGuide";
import { HelpTip } from "./HelpTip";
import { DashboardShellV3 } from "./dashboard-shell/DashboardShellV3";
import { isDashboardShellV3Enabled } from "@/lib/dashboard-shell";
import { cn } from "@/lib/utils";

const FEED_TABS: {
  id: ScannerTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "all", label: "All News", icon: Radio },
  { id: "premarket", label: "Premarket", icon: Sun },
  { id: "watchlist", label: "Watchlist", icon: Star },
];

const MODE_KEY = "tt-dashboard-mode";

export function TradingDashboard({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
  initialScanner = null,
  shellV3,
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
  initialScanner?: MarketScannerSnapshot | null;
  /** Server-resolved feature flag; falls back to client env helper */
  shellV3?: boolean;
}) {
  const useShellV3 = shellV3 ?? isDashboardShellV3Enabled();

  if (useShellV3) {
    return (
      <DashboardShellV3
        initialCatalysts={initialCatalysts}
        initialWatchlist={initialWatchlist}
        initialFilters={initialFilters}
        initialScanner={initialScanner}
      />
    );
  }

  return (
    <TradingDashboardLegacy
      initialCatalysts={initialCatalysts}
      initialWatchlist={initialWatchlist}
      initialFilters={initialFilters}
      initialScanner={initialScanner}
    />
  );
}

/** Legacy multi-panel desk — retained behind dashboardShellV3=false */
function TradingDashboardLegacy({
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
  const [tab, setTab] = useState<ScannerTab>("all");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [mode, setMode] = useState<"focus" | "full">("focus");

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
      if (params.get("focus") === "1") {
        setMode("focus");
        try {
          localStorage.setItem(MODE_KEY, "focus");
        } catch {
          /* ignore */
        }
      }
      const muteSym = params.get("mute");
      if (muteSym && /^[A-Za-z]{1,5}$/.test(muteSym)) {
        const key = "tt-muted-symbols-v1";
        const prev = JSON.parse(localStorage.getItem(key) || "[]") as string[];
        const next = [...new Set([...prev, muteSym.toUpperCase()])];
        localStorage.setItem(key, JSON.stringify(next));
      }
    } catch {
      /* ignore */
    }

    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || data.type !== "tt-notification-action") return;
      if (data.action === "mute" && typeof data.symbol === "string") {
        try {
          const key = "tt-muted-symbols-v1";
          const prev = JSON.parse(localStorage.getItem(key) || "[]") as string[];
          localStorage.setItem(
            key,
            JSON.stringify([
              ...new Set([...prev, String(data.symbol).toUpperCase()]),
            ])
          );
        } catch {
          /* ignore */
        }
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);

  const setDashboardMode = useCallback((next: "focus" | "full") => {
    setMode(next);
    if (next === "focus") setShowTools(false);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

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

  const openExtras = useCallback((_step?: { id: string; target?: string }) => {
    setShowTools(true);
    setMode("full");
    try {
      localStorage.setItem(MODE_KEY, "full");
    } catch {
      /* ignore */
    }
  }, []);

  const focused = mode === "focus";

  return (
    <LiveQuoteProvider>
      <div className="dashboard-workspace desk-shell flex flex-col h-full min-h-0 gap-[var(--gap)]">
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

        <div className="desk-command shrink-0">
          <div className="desk-seg desk-command-mode" role="group" aria-label="Dashboard mode">
            <button
              type="button"
              data-active={focused}
              onClick={() => setDashboardMode("focus")}
              title="Focus — only what you need to trade cleaner"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Focus
            </button>
            <button
              type="button"
              data-active={!focused}
              onClick={() => setDashboardMode("full")}
              title="Full — extra panels"
            >
              <Layers className="w-3.5 h-3.5" />
              Full
            </button>
          </div>
          <HelpTip title="Focus vs Full">
            Focus keeps the desk simple: materiality, direction, reaction stage,
            tradeability, and top risk — plus wire &amp; volume, dilution, and your
            ledger. Full adds extras when you want them.
          </HelpTip>

          <div className="desk-command-status flex-1 min-w-0" data-guide="trust-status">
            <TrustStatusBar className="!border-0 !bg-transparent !px-0 !py-0" />
            <LiveConnectionStatus />
          </div>

          <div className="desk-command-actions flex items-center gap-2 shrink-0">
            <Link
              href="/today"
              className="text-[12px] font-medium text-[--text-secondary] hover:text-[--accent-bright] transition-colors hidden sm:inline"
            >
              Daily plan
            </Link>
            <Link href="/desk" className="desk-btn-ghost text-[12px]">
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Prop Desk</span>
            </Link>
          </div>
        </div>

        <div className="px-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[--text-tertiary]">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-cyan-300">Materiality</span> attention priority
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-emerald-300">Direction</span> catalyst implication
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-amber-200">Risk</span> highest capital caution
          </span>
          <HelpTip title="How judgment labels work">
            Materiality is whether the event warrants review. Direction is catalyst
            implication only — not a buy or sell instruction. Expand a row for reaction
            stage, tradeability, and evidence. Not financial advice.
          </HelpTip>
        </div>

        <AlertSetupNudge />

        <div className="desk-main-grid grid grid-cols-1 xl:grid-cols-12 gap-[var(--gap)] min-h-0 flex-1">
          <aside className="desk-sidebar xl:col-span-4 min-h-0 flex flex-col gap-[var(--gap)] overflow-y-auto">
            <div data-guide="session-plan">
              <SessionPlanCard />
            </div>

            <div data-guide="dilution-radar">
              <DilutionRadar />
            </div>

            <div data-guide="skip-ledger">
              <GreenLedger />
            </div>

            <TraderFeedbackPanel />

            <div data-guide="wins-brief" className="shrink-0">
              <SpeedWinsPanel showViewAll title="Speed wins" />
            </div>

            {!focused && (
              <div data-guide="premarket">
                <PremarketCenter />
              </div>
            )}

            <div
              data-guide="market-monitor"
              className="desk-market-monitor flex-1 min-h-[280px] xl:min-h-[420px]"
            >
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <span className="desk-label">Wire &amp; volume</span>
                <HelpTip title="Wire & volume">
                  Live alerts (HOD, volume surges) and heavy relative-volume names. Use this to
                  see what the market is actually trading — not just what headlines say.
                </HelpTip>
              </div>
              <MarketMonitor className="h-full" initialSnapshot={initialScanner} />
            </div>

            {!focused && (
              <>
                <WatchlistBrief />
                <div data-guide="catches-board">
                  <CatchesBoard />
                </div>
              </>
            )}
          </aside>

          <section
            data-guide="news-feed"
            className="desk-feed-panel xl:col-span-8 desk-panel flex flex-col min-h-[520px] xl:min-h-0"
          >
            <div className="desk-panel-header desk-feed-header shrink-0">
              <span className="desk-label">News feed</span>
              <HelpTip title="News feed">
                Stock-moving headlines only. Each row shows materiality, direction, reaction,
                and tradeability — not a buy or sell label. Expand for
                checklist, news summary, and company performance reasons.
              </HelpTip>
              <div className="desk-feed-tabs flex items-center gap-1">
                {FEED_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    data-active={tab === id}
                    className="desk-feed-tab"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[12px] text-[--text-muted] hidden lg:inline font-mono">
                j/k · Enter · O/T/W/U/E · /
              </span>
            </div>

            <LiveScanner
              embedded
              tab={tab}
              onTabChange={setTab}
              initialCatalysts={initialCatalysts}
              initialWatchlist={initialWatchlist}
              initialFilters={initialFilters}
              focusCompact={focused}
            />
          </section>
        </div>

        {!focused && (
          <div data-guide="judgment-toggle" className="desk-tools-rail shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowTools((v) => !v)}
                className={cn(
                  "desk-btn-accent",
                  !showTools && "opacity-80 hover:opacity-100"
                )}
                style={
                  !showTools
                    ? {
                        background: "var(--bg-elevated)",
                        borderColor: "var(--border-medium)",
                        color: "var(--text-secondary)",
                      }
                    : undefined
                }
              >
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    showTools && "rotate-180"
                  )}
                />
                {showTools ? "Hide extras" : "More tools"}
              </button>
              <span className="text-[12px] text-[--text-muted] hidden sm:inline">
                Optional — calls, edge, replay
              </span>
            </div>

            {showTools && (
              <div className="flex flex-col gap-[var(--gap)] mt-4">
                <div data-guide="daily-edge">
                  <DailyEdgeRecap />
                </div>
                <SessionRecap />
                <WatchlistAutopsy symbols={initialWatchlist} />
                <SympathyMapPanel seedSymbol={initialWatchlist[0]} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--gap)]">
                  <CatalystReplayPanel />
                  <div data-guide="call-board">
                    <CallBoard />
                  </div>
                </div>
                <SpeedBacktestPanel />
                <SpeedEdgeLedger />
                <PaperTradeLedger />
              </div>
            )}
          </div>
        )}

        {focused && (
          <p className="text-[12px] text-center text-[--text-muted]">
            Need calls or advanced tools? Switch to{" "}
            <button
              type="button"
              className="text-emerald-400 hover:underline"
              onClick={() => setDashboardMode("full")}
            >
              Full mode
            </button>
            .
          </p>
        )}

        <p className="desk-disclaimer text-[10px] text-[--text-muted] text-center shrink-0 pb-1">
          Not financial advice · dimensions separate attention from direction · click tickers for charts
        </p>

        <PlatformGuide surface="dashboard" onExtrasRequired={openExtras} />
      </div>
    </LiveQuoteProvider>
  );
}
