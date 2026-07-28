"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Filter,
  MoreHorizontal,
  Search,
  Volume2,
  X,
  Download,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { CatalystItem, ScannerFilters } from "@/types";
import { LiveScanner, type ScannerTab } from "../LiveScanner";
import { FOCUS_MODE_V2_VERSION } from "@/lib/focus-mode";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export type FocusFilterTab = "all" | "watchlist" | "strategy";

/**
 * Focus Mode V2 shell chrome — minimal live-trading surface.
 * Feed body is LiveScanner with focusModeV2 (max 5 priority rows).
 */
export function FocusModeV2({
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
  searchValue = "",
  onSearchChange,
  onExitFocus,
  onCatalystActivate,
  onFocusedCatalystChange,
  onLastEventAtChange,
  onShowAllNews,
  onEditFocusRules,
  onReviewWatchlist,
  focusCatalystId = null,
}: {
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onExitFocus: () => void;
  onCatalystActivate?: (c: CatalystItem) => void;
  onFocusedCatalystChange?: (c: CatalystItem | null) => void;
  onLastEventAtChange?: (at: Date | null) => void;
  onShowAllNews?: () => void;
  onEditFocusRules?: () => void;
  onReviewWatchlist?: () => void;
  /** Deep-link / drawer selection — keep row focus aligned */
  focusCatalystId?: string | null;
}) {
  const [filterTab, setFilterTab] = useState<FocusFilterTab>("all");
  const [localSearch, setLocalSearch] = useState(searchValue);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [filterOpenSignal, setFilterOpenSignal] = useState(0);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  const scannerTab: ScannerTab =
    filterTab === "watchlist"
      ? "watchlist"
      : filterTab === "strategy"
        ? "strategy"
        : "all";

  const filters: ScannerFilters = {
    ...(initialFilters ?? {}),
    ...(localSearch.trim() ? { search: localSearch.trim() } : {}),
  };

  return (
    <section
      className="desk-panel flex flex-col min-h-[70vh]"
      data-guide="focus-mode-rail"
      data-focus-mode="v2"
      data-testid="focus-mode-v2"
      aria-label="Focus Mode"
    >
      <div className="shrink-0 border-b border-[--border] px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-[--text-primary]">
            Focus
          </h2>
          <span className="text-[10px] text-[--text-muted] font-mono hidden sm:inline">
            {FOCUS_MODE_V2_VERSION}
          </span>
          <div className="flex gap-1 ml-auto sm:ml-2">
            {(
              [
                ["all", "All"],
                ["watchlist", "Watchlist"],
                ["strategy", "Strategy Matches"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`focus-filter-${id}`}
                data-active={filterTab === id}
                className="desk-feed-tab"
                onClick={() => setFilterTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="exit-focus"
            data-guide="exit-focus-guide"
            className="h-8 text-xs gap-1"
            onClick={onExitFocus}
          >
            <X className="w-3.5 h-3.5" />
            Exit Focus
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              data-testid="focus-search"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder="Search…"
              className="w-full h-8 pl-7 pr-2 rounded border border-zinc-700 bg-zinc-950 text-[12px] text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs gap-1"
            data-testid="focus-filter-btn"
            onClick={() => setFilterOpenSignal((n) => n + 1)}
          >
            <Filter className="w-3.5 h-3.5" />
            Filter
          </Button>
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-xs gap-1"
              data-testid="focus-overflow"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((v) => !v)}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              More
            </Button>
            {overflowOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 w-52 rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl py-1"
                role="menu"
              >
                <OverflowItem
                  icon={<Download className="w-3.5 h-3.5" />}
                  label="Export CSV"
                  onClick={() => {
                    setOverflowOpen(false);
                    window.dispatchEvent(new Event("tt-focus-export"));
                  }}
                />
                <OverflowItem
                  icon={<RefreshCw className="w-3.5 h-3.5" />}
                  label="Refresh diagnostics"
                  onClick={() => {
                    setOverflowOpen(false);
                    window.dispatchEvent(new Event("tt-focus-refresh"));
                  }}
                />
                <OverflowItem
                  icon={<Settings2 className="w-3.5 h-3.5" />}
                  label="Advanced filtering"
                  onClick={() => {
                    setOverflowOpen(false);
                    setFilterOpenSignal((n) => n + 1);
                  }}
                />
                <OverflowItem
                  icon={<Volume2 className="w-3.5 h-3.5" />}
                  label="Source / squawk settings"
                  onClick={() => {
                    setOverflowOpen(false);
                    window.dispatchEvent(new Event("tt-focus-squawk-settings"));
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col" data-guide="focus-row-guide">
        <LiveScanner
          embedded
          tab={scannerTab}
          onTabChange={(t) => {
            if (t === "watchlist") setFilterTab("watchlist");
            else if (t === "strategy") setFilterTab("strategy");
            else setFilterTab("all");
          }}
          initialCatalysts={initialCatalysts}
          initialWatchlist={initialWatchlist}
          initialFilters={filters}
          focusCompact
          focusModeV2
          focusFilterOpenSignal={filterOpenSignal}
          onFocusedCatalystChange={onFocusedCatalystChange}
          onLastEventAtChange={onLastEventAtChange}
          onCatalystActivate={onCatalystActivate}
          focusCatalystId={focusCatalystId}
          focusEmptyActions={{
            onEditRules: onEditFocusRules,
            onShowAll: onShowAllNews,
            onReviewWatchlist,
          }}
        />
      </div>
    </section>
  );
}

function OverflowItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-zinc-300 hover:bg-zinc-900"
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
