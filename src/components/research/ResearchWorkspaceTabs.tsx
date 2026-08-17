"use client";

import { cn } from "@/lib/utils";
import {
  RESEARCH_TAB_IDS,
  type TickerTabId,
} from "@/lib/ticker-tabs";

const TAB_LABELS: Record<TickerTabId, string> = {
  overview: "Overview",
  "what-changed": "What Changed",
  thesis: "Thesis",
  financials: "Financials",
  capital: "Capital",
  insiders: "Insiders",
  ownership: "Ownership",
  filings: "Filings",
  timeline: "Timeline",
};

export function ResearchWorkspaceTabs({
  active,
  onSelect,
}: {
  active: TickerTabId;
  onSelect: (tab: TickerTabId) => void;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-zinc-800 pb-px -mx-1 px-1 overflow-x-auto"
      aria-label="Research company sections"
      role="tablist"
      data-testid="research-workspace-tabs"
      data-guide="research-workspace-tabs"
    >
      {RESEARCH_TAB_IDS.map((id) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            onClick={() => onSelect(id)}
            className={cn(
              "px-2.5 sm:px-3 min-h-[44px] sm:min-h-10 inline-flex items-center text-[12px] sm:text-[13px] rounded-t-md border border-transparent transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              isActive
                ? "border-zinc-700 border-b-zinc-950 bg-zinc-900/60 text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            )}
            aria-selected={isActive}
            data-testid={`research-tab-${id}`}
          >
            {TAB_LABELS[id]}
          </button>
        );
      })}
    </nav>
  );
}
