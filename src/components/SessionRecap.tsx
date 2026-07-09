"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface RecapData {
  storyCount: number;
  best: { symbol: string; changePercent: number | null } | null;
  worst: { symbol: string; changePercent: number | null } | null;
  avgSentiment: number | null;
  movers: {
    symbol: string;
    headline: string;
    changePercent: number | null;
  }[];
}

export function SessionRecap({ className }: { className?: string }) {
  const [data, setData] = useState<RecapData | null>(null);

  useEffect(() => {
    const delay = setTimeout(() => {
      void fetch("/api/session-recap")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setData(d))
        .catch(() => {});
    }, 900);
    return () => clearTimeout(delay);
  }, []);

  if (!data || data.storyCount === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[11px] font-semibold text-zinc-300">Today&apos;s session</span>
        <span className="text-[10px] text-zinc-600 ml-auto">{data.storyCount} stories on watchlist</span>
      </div>
      <div className="flex flex-wrap gap-3 text-[10px]">
        {data.best && (
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            Top gainer {data.best.symbol} {formatPercent(data.best.changePercent ?? 0)}
          </span>
        )}
        {data.worst && (
          <span className="inline-flex items-center gap-1 text-red-400">
            <TrendingDown className="w-3 h-3" />
            Biggest drop {data.worst.symbol} {formatPercent(data.worst.changePercent ?? 0)}
          </span>
        )}
        {data.avgSentiment != null && (
          <span className="text-zinc-500">
            Avg sentiment{" "}
            <span className="text-zinc-300 font-mono">{data.avgSentiment}</span>
          </span>
        )}
      </div>
    </div>
  );
}
