"use client";

import { useEffect, useState } from "react";
import { Sun, Star, Radio } from "lucide-react";
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
import { AlertSetupNudge } from "./AlertSetupNudge";
import { LiveQuoteProvider } from "./LiveQuoteProvider";
import { MarketMonitor } from "./MarketMonitor";
import { cn } from "@/lib/utils";

const TABS: { id: ScannerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All News", icon: Radio },
  { id: "premarket", label: "Premarket", icon: Sun },
  { id: "watchlist", label: "Watchlist", icon: Star },
];

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

  useEffect(() => {
    void fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.onboardingCompleted === false) setShowOnboarding(true);
      })
      .catch(() => {});
  }, []);

  return (
    <LiveQuoteProvider>
    <div className="flex flex-col h-full min-h-0 gap-2">
      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}

      <TrustStatusBar />
      <AlertSetupNudge />
      <DailyEdgeRecap />
      <SessionPlanCard />
      <SessionRecap />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0 flex-1">
        <div className="lg:col-span-7 min-h-0 flex flex-col gap-2 overflow-y-auto">
          <PremarketCenter />
          <MarketMonitor className="flex-[1.7] min-h-[320px] lg:min-h-0" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <SpeedWinsPanel showViewAll />
            <WatchlistBrief />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <DilutionRadar />
            <WatchlistAutopsy symbols={initialWatchlist} />
          </div>
          <SympathyMapPanel seedSymbol={initialWatchlist[0]} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
            <CatalystReplayPanel />
            <CallBoard />
          </div>
          <SpeedBacktestPanel />
          <SpeedEdgeLedger />
          <PaperTradeLedger />
        </div>

        <div className="lg:col-span-5 flex flex-col min-h-0 border border-zinc-800 rounded-lg bg-zinc-950/40 overflow-hidden">
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
            <span className="ml-auto text-[9px] text-zinc-600 hidden sm:inline">j/k · Enter · /</span>
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
    </div>
    </LiveQuoteProvider>
  );
}
