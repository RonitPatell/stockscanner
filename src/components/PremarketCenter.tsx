"use client";

import { useEffect, useState } from "react";
import { Sun, TrendingUp, Newspaper } from "lucide-react";
import type { CatalystItem, WatchlistBrief } from "@/types";
import { cn, formatPercent } from "@/lib/utils";
import { setupTagMeta } from "@/lib/setup-tags";

interface PremarketData {
  session: string;
  gappers: CatalystItem[];
  overnight: CatalystItem[];
  brief: WatchlistBrief | null;
}

export function PremarketCenter({ className }: { className?: string }) {
  const [data, setData] = useState<PremarketData | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/premarket")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setData(d))
        .catch(() => {});
    };
    const delay = setTimeout(load, 700);
    const t = setInterval(load, 30_000);
    return () => {
      clearTimeout(delay);
      clearInterval(t);
    };
  }, []);

  const gappers = data?.gappers ?? [];
  const show = data?.session === "premarket" || gappers.length > 0;

  if (!show) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-zinc-950/80 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-amber-500/15 bg-amber-500/5">
        <div className="flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] font-semibold text-amber-200">Premarket Command Center</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 capitalize">
            {data?.session ?? "premarket"}
          </span>
        </div>
        <span className="text-[10px] text-zinc-500">{gappers.length} gappers</span>
      </div>

      <div className="grid sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
        <div className="p-2 max-h-36 overflow-y-auto">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> Gap watch
          </div>
          {gappers.length === 0 ? (
            <p className="text-[10px] text-zinc-600">No premarket gappers yet.</p>
          ) : (
            <div className="space-y-1">
              {gappers.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 text-[10px] py-1 px-1.5 rounded bg-zinc-900/50 border border-zinc-800/60"
                >
                  <span className="font-mono font-bold text-white w-11">{c.symbol}</span>
                  <span
                    className={cn(
                      "font-mono shrink-0",
                      (c.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(c.changePercent ?? 0)}
                  </span>
                  <span className="text-zinc-500 truncate flex-1">{c.headline}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-2 max-h-36 overflow-y-auto">
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1.5">
            <Newspaper className="w-3 h-3 text-cyan-400" /> Watchlist overnight
          </div>
          {data?.brief?.sections?.[0]?.items?.length ? (
            <div className="space-y-1">
              {data.brief.sections[0].items.slice(0, 6).map((item, i) => (
                <div key={`${item.symbol}-${item.publishedAt}-${i}`} className="text-[10px] py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{item.symbol}</span>
                    {item.setupTags?.slice(0, 1).map((tag) => {
                      const m = setupTagMeta(tag);
                      return m ? (
                        <span key={tag} className="text-[9px] text-zinc-500">
                          {m.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <p className="text-zinc-500 line-clamp-1">{item.headline}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-zinc-600">Add tickers to your watchlist for overnight brief.</p>
          )}
        </div>
      </div>
    </div>
  );
}
