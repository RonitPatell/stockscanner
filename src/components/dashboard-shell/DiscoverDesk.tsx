"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Discover desk — primary IA slot for market opportunity rules.
 * Rules engine ships later; keep the surface honest and useful.
 */
export function DiscoverDesk() {
  return (
    <section
      data-guide="discover-desk"
      data-testid="discover-desk"
      className="max-w-2xl space-y-6"
    >
      <header>
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-1">
          Discover
        </p>
        <h2 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-zinc-100">
          Market-wide opportunity rules
        </h2>
        <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
          Discover will surface names matching deterministic opportunity rules
          across the broader market — separate from your monitored portfolio.
          Informational only; not buy or sell advice.
        </p>
      </header>

      <div className="desk-panel desk-panel--raised p-4 space-y-3">
        <p className="text-sm text-zinc-300">
          Opportunity rules are not live yet. Until then, use Portfolio to
          choose what you monitor and Watchtower for material changes on those
          names.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard?view=portfolio"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Open Portfolio
          </Link>
          <Link
            href="/dashboard?view=watchtower"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Open Watchtower
          </Link>
          <Link
            href="/dashboard?view=research"
            className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
          >
            Research a ticker
          </Link>
        </div>
      </div>
    </section>
  );
}
