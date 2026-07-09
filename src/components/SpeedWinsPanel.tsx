"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import { SpeedWinCard } from "./LiveProofStrip";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface SpeedWin {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  ingestedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
  catalystType: string | null;
}

export function SpeedWinsPanel({
  className,
  limit = 5,
  title = "Caught it",
  showViewAll,
}: {
  className?: string;
  limit?: number;
  title?: string;
  showViewAll?: boolean;
}) {
  const [wins, setWins] = useState<SpeedWin[]>([]);

  useEffect(() => {
    const load = () => {
      void fetch(`/api/speed-wins?limit=${limit}&sort=fastest`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.wins && setWins(d.wins))
        .catch(() => {});
    };
    const delay = setTimeout(load, 400);
    const interval = setInterval(load, 12_000);
    return () => {
      clearTimeout(delay);
      clearInterval(interval);
    };
  }, [limit]);

  if (wins.length === 0) return null;

  return (
    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden shrink-0", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-zinc-300">{title}</span>
          <span className="text-[9px] text-zinc-600">publish → feed → move</span>
        </div>
        {showViewAll && (
          <Link href="/wins" className="text-[10px] text-emerald-500 hover:underline">
            View all
          </Link>
        )}
      </div>
      <div className="max-h-44 overflow-y-auto divide-y divide-zinc-800/60">
        {wins.map((w) => (
          <div key={w.id} className="px-3 py-2 hover:bg-zinc-900/30">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-white">{w.symbol}</span>
              <span
                className={cn(
                  "font-mono",
                  (w.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {(w.changePercent ?? 0) >= 0 ? "+" : ""}
                {w.changePercent?.toFixed(1)}%
              </span>
              <span className="text-emerald-500/80 font-mono text-[10px]">+{w.ingestDelaySec}s</span>
              <span className="text-zinc-600 truncate flex-1">{w.headline}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpeedWinsGrid({ wins }: { wins: SpeedWin[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {wins.map((w) => (
        <SpeedWinCard key={w.id} win={w} showTimeline />
      ))}
    </div>
  );
}

export function SpeedWinsCTA({ isSubscribed = false }: { isSubscribed?: boolean }) {
  if (isSubscribed) {
    return (
      <Link href="/dashboard">
        <Button size="lg" className="mt-8">
          Back to live scanner <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
    );
  }

  return (
    <Link href="/pricing">
      <Button size="lg" className="mt-8">
        Catch the next one — Start free trial <ArrowRight className="w-4 h-4" />
      </Button>
    </Link>
  );
}
