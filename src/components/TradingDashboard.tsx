"use client";

import { useState } from "react";
import { Sun, Star, Radio } from "lucide-react";
import { MarketMonitor } from "./MarketMonitor";
import { LiveScanner, type ScannerTab } from "./LiveScanner";
import { WatchlistBrief } from "./WatchlistBrief";
import { cn } from "@/lib/utils";

const TABS: { id: ScannerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "all", label: "All News", icon: Radio },
  { id: "premarket", label: "Premarket", icon: Sun },
  { id: "watchlist", label: "Watchlist", icon: Star },
];

export function TradingDashboard() {
  const [tab, setTab] = useState<ScannerTab>("all");

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0 flex-1">
        {/* Left: quadrant-style market panels */}
        <div className="lg:col-span-7 min-h-0 flex flex-col gap-2">
          <WatchlistBrief className="shrink-0" />
          <MarketMonitor className="flex-1 min-h-0" />
        </div>

        {/* Right: vertical news feed sidebar */}
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
          </div>
          <LiveScanner embedded tab={tab} />
        </div>
      </div>

      <p className="text-[9px] text-zinc-700 text-center shrink-0 leading-none pt-1 pb-0.5">
        Not financial advice · data may be delayed · click ticker for chart
      </p>
    </div>
  );
}
