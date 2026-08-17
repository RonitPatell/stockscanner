"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type TickerTabId = "overview" | "financials" | "what-changed";

const TABS: { id: TickerTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "what-changed", label: "What Changed" },
  { id: "financials", label: "Financials" },
];

export function parseTickerTab(raw: string | undefined | null): TickerTabId {
  if (raw === "financials" || raw === "what-changed" || raw === "overview") {
    return raw;
  }
  return "overview";
}

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
      className="flex flex-wrap gap-1 border-b border-zinc-800 pb-px"
      aria-label="Ticker sections"
      data-guide="ticker-workspace-tabs"
      data-testid="ticker-workspace-tabs"
    >
      {TABS.map((t) => {
        const href =
          t.id === "overview"
            ? `/ticker/${sym}`
            : `/ticker/${sym}?tab=${t.id}`;
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            href={href}
            scroll={false}
            className={cn(
              "px-3 py-2 text-[12px] sm:text-[13px] rounded-t-md border border-transparent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
              isActive
                ? "border-zinc-700 border-b-zinc-950 bg-zinc-900/60 text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            )}
            aria-current={isActive ? "page" : undefined}
            data-testid={`ticker-tab-${t.id}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
