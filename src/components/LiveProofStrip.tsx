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

  const avg = stats?.latency.p50Sec ?? stats?.latency.avgSec;
  const fastest = stats?.latency.fastestSec;
  const recent = stats?.recentWins ?? [];
  const formatIngest = (sec: number) =>
    sec >= 120 ? `${(sec / 60).toFixed(1)}m` : `${Math.round(sec)}s`;
  const underRate =
    stats?.latency.under30sRate ??
    stats?.latency.under3mRate ??
    stats?.latency.under60sRate;
  const showUnder3m = underRate != null && underRate > 0;

  return (
    <div
      className={cn(
        "overflow-hidden mk-panel",
        className
      )}
    >
      <div className={cn("px-4 sm:px-5", compact ? "py-3" : "py-5")}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
          <span className="mk-tick !text-emerald-400 inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Live proof
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Zap className="w-3 h-3 text-emerald-500/80" />
            Source poll ~{stats?.sourcePollCycleSec ?? stats?.wireCycleSec ?? 60}s
          </span>
          {avg != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Clock className="w-3 h-3" />
              Desk p50{" "}
              <strong className="text-emerald-400 font-mono font-medium">{formatIngest(avg)}</strong>
              {stats?.latency.sampleSize ? (
                <span className="text-zinc-600"> · n={stats.latency.sampleSize}</span>
              ) : null}
            </span>
          )}
          {showUnder3m && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <strong className="text-emerald-400 font-medium">{underRate}%</strong>{" "}
              under 30s
            </span>
          )}
          {fastest != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <TrendingUp className="w-3 h-3 text-emerald-500/80" />
              Fastest{" "}
              <strong className="text-emerald-400 font-mono font-medium">{formatIngest(fastest)}</strong>
            </span>
          )}
          {stats?.feed.itemCount ? (
            <span className="text-[11px] text-zinc-600 ml-auto">{stats.feed.itemCount} in feed</span>
          ) : null}
        </div>

        {!compact && (
          <div className="border-t mk-hairline divide-y divide-[var(--hairline)]">
            <div className="mk-tick flex items-center gap-1.5 py-2.5">
              <TrendingUp className="w-3 h-3 text-emerald-500/80" />
              Fastest ingests
            </div>
            {recent.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3">
                {stats
                  ? "No catch samples in the current window yet — ingest a few headlines and this fills automatically."
                  : "Loading live proof…"}
              </p>
            ) : (
              recent.slice(0, 3).map((win) => {
                const delayLabel =
                  win.ingestDelaySec >= 120
                    ? `+${Math.round(win.ingestDelaySec / 60)}m`
                    : `+${win.ingestDelaySec}s`;
                return (
                  <div
                    key={`${win.symbol}-${win.ingestDelaySec}-${win.headline.slice(0, 24)}`}
                    className="py-3 transition-colors duration-300 hover:bg-emerald-500/[0.03]"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono font-bold text-white tracking-tight">{win.symbol}</span>
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
                      <span className="text-[10px] text-emerald-500/90 font-mono">{delayLabel}</span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-1 mt-1">{win.headline}</p>
                  </div>
                );
              })
            )}
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
    <div className="bg-[var(--bg-graphite)]/80 p-5 transition-colors duration-300 hover:bg-emerald-500/[0.04]">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <span className="font-mono font-bold text-lg text-white tracking-tight">{win.symbol}</span>
          {win.catalystType && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-500 border mk-hairline px-1.5 py-0.5">
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
      <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{win.headline}</p>
      {showTimeline && mounted && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-600 mb-2">
          <span>Published {formatClockTime(win.publishedAt)}</span>
          <span className="text-zinc-700">→</span>
          <span className="text-emerald-500/90">In feed {formatClockTime(win.ingestedAt)}</span>
          <span className="text-zinc-700">·</span>
          <span className="text-emerald-400">+{win.ingestDelaySec}s</span>
        </div>
      )}
      <p className="text-[10px] text-zinc-600">{win.source}</p>
    </div>
  );
}
