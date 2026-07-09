"use client";

import Link from "next/link";
import { Radio, Sun, Star, Newspaper, Activity, Flame, Gauge, ArrowRight } from "lucide-react";
import { CatalystCard } from "@/components/CatalystCard";
import { Button } from "@/components/ui/button";
import {
  DEMO_BRIEF,
  DEMO_CATALYSTS,
  DEMO_MARKET_STATE,
  DEMO_SCANNER,
} from "@/lib/demo-data";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import { setupTagMeta } from "@/lib/setup-tags";

export function DemoDashboard() {
  const briefItems = DEMO_BRIEF.sections.flatMap((s) => s.items).slice(0, 4);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      <div className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-200">Sample demo — not live data</p>
          <p className="text-[11px] text-amber-200/70">
            Illustrative headlines and prices only. Subscribe for the real-time catalyst feed.
          </p>
        </div>
        <Link href="/pricing">
          <Button size="sm" className="shrink-0 text-xs">
            Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 min-h-0 flex-1">
        <div className="lg:col-span-7 min-h-0 flex flex-col gap-2">
          {/* Watchlist brief (static) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/40">
              <Newspaper className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium text-zinc-300">Watchlist Brief</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                morning
              </span>
            </div>
            <p className="px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-800/80">
              {DEMO_BRIEF.summary}
            </p>
            <div className="max-h-28 overflow-y-auto divide-y divide-zinc-800/60">
              {briefItems.map((item) => (
                <div key={item.symbol} className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold">{item.symbol}</span>
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        (item.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatPercent(item.changePercent ?? 0)}
                    </span>
                    {item.setupTags?.map((tag) => {
                      const meta = setupTagMeta(tag);
                      return meta ? (
                        <span
                          key={tag}
                          className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400"
                        >
                          {meta.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-500 line-clamp-1 mt-0.5">{item.headline}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Market panels (static) */}
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 overflow-hidden">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 overflow-hidden flex flex-col">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
                <Flame className="w-3 h-3 text-orange-400" /> Wire Alerts
              </div>
              <div className="space-y-1.5 overflow-y-auto flex-1">
                {DEMO_SCANNER.alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 text-[10px] py-1 px-2 rounded bg-zinc-900/60 border border-zinc-800/80"
                  >
                    <span className="font-mono font-bold w-10">{a.symbol}</span>
                    <span className="text-zinc-500 truncate flex-1">{a.message}</span>
                    <span className="font-mono text-emerald-400 shrink-0">
                      {formatPercent(a.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 overflow-hidden flex flex-col">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
                <Activity className="w-3 h-3 text-emerald-400" /> Volume Leaders
              </div>
              <div className="space-y-1.5 overflow-y-auto flex-1">
                {DEMO_SCANNER.volumeLeaders.map((l) => (
                  <div
                    key={l.symbol}
                    className="flex items-center gap-2 text-[10px] py-1 px-2 rounded bg-zinc-900/60 border border-zinc-800/80"
                  >
                    <span className="font-mono font-bold w-10">{l.symbol}</span>
                    <span className="text-zinc-500">{l.rVol.toFixed(1)}× rVol</span>
                    <span className="font-mono text-emerald-400 ml-auto">
                      {formatPercent(l.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">
                <Gauge className="w-3 h-3 text-cyan-400" /> Market State
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DEMO_MARKET_STATE).map(([sym, q]) => (
                  <div
                    key={sym}
                    className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 text-[10px]"
                  >
                    <span className="font-mono font-bold text-zinc-200">{sym}</span>
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span className="font-mono text-zinc-400">{formatPrice(q.price)}</span>
                    <span
                      className={cn(
                        "ml-1.5 font-mono",
                        q.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatPercent(q.changePercent)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feed sidebar (static catalyst cards) */}
        <div className="lg:col-span-5 flex flex-col min-h-0 border border-zinc-800 rounded-lg bg-zinc-950/40 overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Radio className="w-3 h-3" /> All News
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-zinc-600">
              <Sun className="w-3 h-3" /> Premarket
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-zinc-600">
              <Star className="w-3 h-3" /> Watchlist
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            {DEMO_CATALYSTS.map((c) => (
              <CatalystCard key={c.id} catalyst={c} demoMode />
            ))}
          </div>
        </div>
      </div>

      <p className="text-[9px] text-zinc-700 text-center shrink-0 leading-none pt-1 pb-0.5">
        Sample data for illustration · Not financial advice · Subscribe for live feed
      </p>
    </div>
  );
}
