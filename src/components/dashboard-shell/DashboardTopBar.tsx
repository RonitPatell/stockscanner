"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { BrandHomeLink } from "../BrandHomeLink";
import { UserMenu } from "../UserMenu";
import { ConnectionStatusCompact } from "./ConnectionStatusCompact";
import { MarketSessionBadge } from "./MarketSessionBadge";
import { TrustStatusBar } from "../TrustStatusBar";
import { cn } from "@/lib/utils";

export function DashboardTopBar({
  lastEventAt,
  searchValue,
  onSearchChange,
  className,
}: {
  lastEventAt: Date | null;
  searchValue: string;
  onSearchChange: (v: string) => void;
  className?: string;
}) {
  return (
    <header
      data-guide="dashboard-top-bar"
      className={cn(
        "shrink-0 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl",
        className
      )}
    >
      <div className="max-w-[1680px] mx-auto px-3 sm:px-4 h-12 flex items-center gap-2 sm:gap-3">
        <BrandHomeLink />

        <label className="flex-1 min-w-0 max-w-xs lg:max-w-md relative">
          <span className="sr-only">Search tickers</span>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search ticker or headline"
            className="w-full h-8 rounded-md border border-zinc-700 bg-zinc-950/80 pl-8 pr-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            data-testid="global-ticker-search"
          />
        </label>

        <TrustStatusBar className="hidden sm:flex flex-1 min-w-0 overflow-x-auto" />

        <MarketSessionBadge />
        <ConnectionStatusCompact lastEventAt={lastEventAt} />

        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
          <Link
            href="/desk"
            className="text-[11px] text-zinc-400 hover:text-emerald-300 hidden xl:inline transition-colors"
          >
            Prop Desk
          </Link>
          <Link
            href="/status"
            className="text-[11px] text-zinc-500 hover:text-zinc-300 hidden xl:inline"
          >
            Status
          </Link>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
