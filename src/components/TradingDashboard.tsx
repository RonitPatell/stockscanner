"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sun,
  Star,
  Radio,
  ChevronDown,
  LayoutDashboard,
  Sparkles,
  Layers,
} from "lucide-react";
import type { CatalystItem, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "./LiveScanner";
import { WatchlistBrief } from "./WatchlistBrief";
import { TrustStatusBar } from "./TrustStatusBar";
import { PremarketCenter } from "./PremarketCenter";
import { OnboardingWizard } from "./OnboardingWizard";
import { SessionRecap } from "./SessionRecap";
import { SpeedWinsPanel } from "./SpeedWinsPanel";
import { SpeedEdgeLedger } from "./SpeedEdgeLedger";
import { DilutionRadar } from "./DilutionRadar";
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
import { cn } from "@/lib/utils";

const TABS: { id: ScannerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All News", icon: Radio },
  { id: "premarket", label: "Premarket", icon: Sun },
  { id: "watchlist", label: "Watchlist", icon: Star },
];

const MODE_KEY = "tt-dashboard-mode";

export function TradingDashboard({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
}) {
  const [tab, setTab] = useState<ScannerTab>("all");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [mode, setMode] = useState<"simple" | "advanced">("simple");

  const openExtras = useCallback(() => {
    setShowExtras(true);
    setMode("advanced");
    try {
      localStorage.setItem(MODE_KEY, "advanced");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "advanced" || saved === "simple") setMode(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.onboardingCompleted === false) setShowOnboarding(true);
      })
      .catch(() => {});
  }, []);

  const setDashboardMode = (next: "simple" | "advanced") => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
    if (next === "simple") setShowExtras(false);
  };

  const simple = mode === "simple";

  return (
    <LiveQuoteProvider>
      <div className="flex flex-col h-full min-h-0 gap-2">
        {showOnboarding && (
          <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
        )}

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg border border-zinc-700 p-0.5 bg-zinc-950/80">
            <button
              type="button"
              onClick={() => setDashboardMode("simple")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                simple
                  ? "bg-emerald-500 text-black"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Simple
            </button>
            <button
              type="button"
              onClick={() => setDashboardMode("advanced")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors",
                !simple
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Advanced
            </button>
          </div>
          <p className="text-[10px] text-zinc-600 hidden sm:block">
            {simple
              ? "Wire · plan · feed — less noise"
              : "Full desk — judgment tools, proof, maps"}
          </p>
          <Link
            href="/today"
            className="ml-auto text-[10px] text-emerald-500/90 hover:underline hidden sm:inline"
          >
            Public daily plan →
          </Link>
        </div>

        <div data-guide="trust-status">
          <TrustStatusBar />
        </div>
        <AlertSetupNudge />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0 flex-1">
          <div className="lg:col-span-7 min-h-0 flex flex-col gap-2 overflow-y-auto">
            <div data-guide="session-plan">
              <SessionPlanCard />
            </div>

            {!simple && (
              <div data-guide="premarket">
                <PremarketCenter />
              </div>
            )}

            <div
              data-guide="market-monitor"
              className="flex-[1.7] min-h-[320px] lg:min-h-0 flex flex-col"
            >
              <MarketMonitor className="flex-1 min-h-[320px] lg:min-h-0" />
            </div>

            {!simple && (
              <>
                <div
                  data-guide="wins-brief"
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0"
                >
                  <SpeedWinsPanel showViewAll />
                  <WatchlistBrief />
                </div>
                <div data-guide="catches-board">
                  <CatchesBoard />
                </div>
              </>
            )}

            <div
              data-guide="judgment-toggle"
              className="flex flex-wrap items-center gap-2 shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2"
            >
              <button
                type="button"
                onClick={() => {
                  if (simple) setDashboardMode("advanced");
                  setShowExtras((v) => !v);
                }}
                className={cn(
                  "inline-flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-md border transition-colors",
                  showExtras
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-emerald-500/50 bg-emerald-500 text-black hover:bg-emerald-400 shadow-sm shadow-emerald-500/20"
                )}
              >
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    showExtras && "rotate-180"
                  )}
                />
                {showExtras ? "Hide judgment tools" : "Show judgment tools"}
              </button>
              <span className="text-[10px] text-zinc-500 hidden sm:inline">
                Dilution · calls · edge · replay
              </span>
              <Link
                href="/desk"
                className="ml-auto inline-flex items-center gap-2 text-[11px] font-semibold px-3 py-2 rounded-md border border-orange-500/50 bg-orange-500/15 text-orange-200 hover:bg-orange-500/25 hover:border-orange-400/60 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Open Prop Desk
              </Link>
            </div>

            {showExtras && (
              <div className="flex flex-col gap-2 shrink-0 pb-1">
                <div data-guide="daily-edge">
                  <DailyEdgeRecap />
                </div>
                <SessionRecap />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div data-guide="dilution-radar">
                    <DilutionRadar />
                  </div>
                  <WatchlistAutopsy symbols={initialWatchlist} />
                </div>
                <SympathyMapPanel seedSymbol={initialWatchlist[0]} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          <div
            data-guide="news-feed"
            className="lg:col-span-5 flex flex-col min-h-0 border border-zinc-800 rounded-lg bg-zinc-950/40 overflow-hidden"
          >
            <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                    tab === id
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[9px] text-zinc-600 hidden sm:inline">
                j/k · Enter · /
              </span>
            </div>
            <LiveScanner
              embedded
              tab={tab}
              onTabChange={setTab}
              initialCatalysts={initialCatalysts}
              initialWatchlist={initialWatchlist}
              initialFilters={initialFilters}
            />
          </div>
        </div>

        <p className="text-[9px] text-zinc-700 text-center shrink-0 leading-none pt-1 pb-0.5">
          Not financial advice · ingest latency shown per headline · click ticker for chart
        </p>

        <PlatformGuide surface="dashboard" onExtrasRequired={openExtras} />
      </div>
    </LiveQuoteProvider>
  );
}
