"use client";

import { useEffect, useState } from "react";
import { Clock, TrendingUp, Zap } from "lucide-react";
import { cn, formatPercent, formatClockTime } from "@/lib/utils";

interface PublicStats {
  latency: {
    avgSec: number | null;
    p50Sec: number | null;
    under60sRate?: number | null;
    under3mRate?: number | null;
    under30sRate?: number | null;
    sampleSize: number;
    fastestSec?: number | null;
  };
  feed: { itemCount: number; status: string };
  sourcePollCycleSec?: number;
  wireCycleSec?: number;
  recentWins: {
    symbol: string;
    headline: string;
    ingestDelaySec: number;
    changePercent: number | null;
  }[];
}

export function LiveProofStrip({ className, compact }: { className?: string; compact?: boolean }) {
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/public-stats")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setStats(d))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, []);

  const avg = stats?.latency.avgSec;
  const fastest = stats?.latency.fastestSec;
  const recent = stats?.recentWins ?? [];

  return (
    <div
      className={cn(
        "rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-zinc-900/80 to-cyan-500/5 overflow-hidden",
        className
      )}
    >
      <div className={cn("px-4 py-3", compact ? "py-2.5" : "py-4")}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live proof
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
            <Zap className="w-3 h-3 text-emerald-500" />
            Source poll ~{stats?.sourcePollCycleSec ?? stats?.wireCycleSec ?? 60}s
          </span>
          {avg != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <Clock className="w-3 h-3" />
              Avg ingest <strong className="text-emerald-400 font-mono">{avg}s</strong> after publish
              {stats?.latency.sampleSize ? (
                <span className="text-zinc-600"> (n={stats.latency.sampleSize})</span>
              ) : null}
            </span>
          )}
          {(stats?.latency.under3mRate ?? stats?.latency.under60sRate) != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <strong className="text-emerald-400">
                {stats?.latency.under3mRate ?? stats?.latency.under60sRate}%
              </strong>{" "}
              under 3m
            </span>
          )}
          {fastest != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Fastest catch <strong className="text-emerald-400 font-mono">{fastest}s</strong>
            </span>
          )}
          {stats?.feed.itemCount ? (
            <span className="text-[11px] text-zinc-600 ml-auto">{stats.feed.itemCount} catalysts in feed</span>
          ) : null}
        </div>

        {recent.length > 0 && !compact && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              Caught it — fastest ingests
            </div>
            {recent.slice(0, 3).map((win) => (
              <div
                key={`${win.symbol}-${win.ingestDelaySec}-${win.headline.slice(0, 24)}`}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono font-bold text-white">{win.symbol}</span>
                  {win.changePercent != null && (
                    <span
                      className={cn(
                        "font-mono text-sm",
                        win.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatPercent(win.changePercent)}
                    </span>
                  )}
                  <span className="text-[10px] text-emerald-500/90 font-mono">
                    +{win.ingestDelaySec}s ingest
                  </span>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-1 mt-1">{win.headline}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SpeedWinCard({
  win,
  showTimeline,
}: {
  win: {
    symbol: string;
    headline: string;
    source: string;
    publishedAt: string;
    ingestedAt: string;
    ingestDelaySec: number;
    changePercent: number | null;
    catalystType?: string | null;
  };
  showTimeline?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="font-mono font-bold text-lg text-white">{win.symbol}</span>
          {win.catalystType && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/25">
              {win.catalystType.replace(/_/g, " ")}
            </span>
          )}
        </div>
        <span
          className={cn(
            "font-mono font-semibold text-lg shrink-0",
            (win.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {formatPercent(win.changePercent ?? 0)}
        </span>
      </div>
      <p className="text-sm text-zinc-300 line-clamp-2 mb-3">{win.headline}</p>
      {showTimeline && mounted && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-500 mb-2">
          <span>Published {formatClockTime(win.publishedAt)}</span>
          <span className="text-zinc-700">→</span>
          <span className="text-emerald-500">In feed {formatClockTime(win.ingestedAt)}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-emerald-400">+{win.ingestDelaySec}s</span>
        </div>
      )}
      <p className="text-[10px] text-zinc-600">{win.source}</p>
    </div>
  );
}
