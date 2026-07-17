"use client";

import { useState } from "react";
import type { CatalystItem, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "./LiveScanner";
import { CallBoard } from "./CallBoard";
import { DilutionRadar } from "./DilutionRadar";
import { SkipSavingsLedger } from "./SkipSavingsLedger";
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
      <div className="desk-shell flex flex-col h-full min-h-0 gap-3">
        <div data-guide="trust-status">
          <TrustStatusBar className="desk-panel !bg-zinc-950/75 !border-[var(--border)] !rounded-[var(--desk-radius)] !px-3 !py-2" />
        </div>
        <div data-guide="daily-edge">
          <DailyEdgeRecap />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0 flex-1">
          <div className="xl:col-span-4 min-h-0 flex flex-col gap-3 overflow-y-auto">
            <div data-guide="session-plan">
              <SessionPlanCard />
            </div>
            <div data-guide="dilution-radar">
              <DilutionRadar />
            </div>
            <div data-guide="skip-ledger">
              <SkipSavingsLedger />
            </div>
            <div className="desk-command">
              <span className="desk-label mr-1">Call board</span>
              <button
                type="button"
                onClick={() => setWatchlistCalls(false)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border transition-colors",
                  !watchlistCalls
                    ? "border-orange-500/60 text-orange-200 bg-orange-500/12"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                )}
              >
                All calls
              </button>
              <button
                type="button"
                onClick={() => setWatchlistCalls(true)}
                className={cn(
                  "px-2.5 py-1 rounded-lg border transition-colors",
                  watchlistCalls
                    ? "border-orange-500/60 text-orange-200 bg-orange-500/12"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
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
            className="xl:col-span-8 desk-panel flex flex-col min-h-0 overflow-hidden"
          >
            <div className="desk-panel-header shrink-0">
              <span className="desk-label">Live feed</span>
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  data-active={tab === id}
                  className={cn(
                    "desk-feed-tab",
                    tab === id ? "" : ""
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-zinc-600 font-mono">
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
