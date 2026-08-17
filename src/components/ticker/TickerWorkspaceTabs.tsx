"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  parseTickerTab,
  TICKER_TAB_IDS,
  type TickerTabId,
} from "@/lib/ticker-tabs";

export type { TickerTabId };
export { parseTickerTab };

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

export function TickerWorkspaceTabs({
  symbol,
  active,
}: {
  symbol: string;
  active: TickerTabId;
}) {
  const sym = symbol.toUpperCase();
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-zinc-800 pb-px -mx-1 px-1 overflow-x-auto"
      aria-label="Ticker sections"
      data-guide="ticker-workspace-tabs"
      data-testid="ticker-workspace-tabs"
    >
      {TICKER_TAB_IDS.map((id) => {
        const href =
          id === "overview" ? `/ticker/${sym}` : `/ticker/${sym}?tab=${id}`;
        const isActive = active === id;
        return (
          <Link
            key={id}
            href={href}
            scroll={false}
            className={cn(
              "px-2.5 sm:px-3 py-2 text-[12px] sm:text-[13px] rounded-t-md border border-transparent transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              isActive
                ? "border-zinc-700 border-b-zinc-950 bg-zinc-900/60 text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            )}
            aria-current={isActive ? "page" : undefined}
            data-testid={`ticker-tab-${id}`}
          >
            {TAB_LABELS[id]}
          </Link>
        );
      })}
    </nav>
  );
}
