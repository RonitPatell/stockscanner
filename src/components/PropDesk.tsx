"use client";

import { useState } from "react";
import type { CatalystItem, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "./LiveScanner";
import { CallBoard } from "./CallBoard";
import { DilutionRadar } from "./DilutionRadar";
import { SessionPlanCard } from "./SessionPlanCard";
import { DailyEdgeRecap } from "./DailyEdgeRecap";
import { SpeedEdgeLedger } from "./SpeedEdgeLedger";
import { LiveQuoteProvider } from "./LiveQuoteProvider";
import { TrustStatusBar } from "./TrustStatusBar";
import { PlatformGuide } from "./PlatformGuide";
import { cn } from "@/lib/utils";

const TABS: { id: ScannerTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "premarket", label: "PM" },
  { id: "watchlist", label: "WL" },
];

export function PropDesk({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
}) {
  const [tab, setTab] = useState<ScannerTab>("all");
  const [watchlistCalls, setWatchlistCalls] = useState(true);

  return (
    <LiveQuoteProvider>
      <div className="flex flex-col h-full min-h-0 gap-2">
        <div data-guide="trust-status">
          <TrustStatusBar />
        </div>
        <div data-guide="daily-edge">
          <DailyEdgeRecap />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0 flex-1">
          <div className="lg:col-span-4 min-h-0 flex flex-col gap-2 overflow-y-auto">
            <div data-guide="session-plan">
              <SessionPlanCard />
            </div>
            <div data-guide="dilution-radar">
              <DilutionRadar />
            </div>
            <div className="flex items-center gap-2 px-1">
              <button
                type="button"
                onClick={() => setWatchlistCalls(false)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  !watchlistCalls
                    ? "border-orange-500/50 text-orange-300"
                    : "border-zinc-700 text-zinc-500"
                )}
              >
                All calls
              </button>
              <button
                type="button"
                onClick={() => setWatchlistCalls(true)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded border",
                  watchlistCalls
                    ? "border-orange-500/50 text-orange-300"
                    : "border-zinc-700 text-zinc-500"
                )}
              >
                My watchlist
              </button>
            </div>
            <div data-guide="call-board">
              <CallBoard watchlistOnly={watchlistCalls} />
            </div>
            <SpeedEdgeLedger />
          </div>

          <div
            data-guide="news-feed"
            className="lg:col-span-8 flex flex-col min-h-0 border border-zinc-800 rounded-lg bg-zinc-950/40 overflow-hidden"
          >
            <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium",
                    tab === id
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[9px] text-zinc-600">
                j/k · Enter · w · 1/2/3 · /
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

        <PlatformGuide surface="desk" />
      </div>
    </LiveQuoteProvider>
  );
}
