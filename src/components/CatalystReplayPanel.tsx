"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Rewind } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface ReplayEvent {
  id: string;
  symbol: string;
  headline: string;
  publishedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
  bias: string;
  antiFomoScore: number;
  isDilution: boolean;
  tOffsetSec: number;
}

interface ReplayData {
  durationSec: number;
  eventCount: number;
  events: ReplayEvent[];
  stats: {
    dilutionCount: number;
    under3mRate: number | null;
    avoidBias: number;
  };
}

export function CatalystReplayPanel({ className }: { className?: string }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    void fetch("/api/replay?hours=12&limit=60")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setData(d);
        setCursor(d.durationSec ?? 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!playing || !data) return;
    const id = setInterval(() => {
      setCursor((c) => {
        const next = c + Math.max(30, Math.floor(data.durationSec / 80));
        if (next >= data.durationSec) {
          setPlaying(false);
          return data.durationSec;
        }
        return next;
      });
    }, 400);
    return () => clearInterval(id);
  }, [playing, data]);

  const visible = useMemo(() => {
    if (!data) return [];
    return data.events.filter((e) => e.tOffsetSec <= cursor).slice(-8);
  }, [data, cursor]);

  if (!data || data.eventCount === 0) return null;

  const pct = Math.min(100, (cursor / data.durationSec) * 100);

  return (
    <div
      className={cn(
        "rounded-lg border border-sky-500/25 bg-sky-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sky-500/20 bg-sky-500/10">
        <Rewind className="w-3.5 h-3.5 text-sky-300" />
        <span className="text-[11px] font-semibold text-sky-200">Catalyst Replay</span>
        <span className="text-[9px] text-sky-600">
          last 12h · {data.eventCount} events · {data.stats.dilutionCount} dilutions
        </span>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="ml-auto inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
        >
          {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {playing ? "Pause" : "Play"}
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        <input
          type="range"
          min={0}
          max={data.durationSec}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="w-full accent-sky-400"
        />
        <div className="flex justify-between text-[9px] text-zinc-600 font-mono">
          <span>t=0</span>
          <span>{pct.toFixed(0)}% through window</span>
          <span>now</span>
        </div>
      </div>

      <div className="max-h-40 overflow-y-auto divide-y divide-sky-500/10 border-t border-sky-500/10">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-zinc-600">Drag forward to reveal headlines…</p>
        ) : (
          visible.map((e) => (
            <div key={e.id} className="px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-white">{e.symbol}</span>
                {e.isDilution && (
                  <span className="text-[8px] uppercase text-amber-400 border border-amber-500/40 px-1 rounded">
                    dilution
                  </span>
                )}
                <span className="text-[9px] uppercase text-zinc-500">{e.bias}</span>
                <span className="text-[9px] text-amber-400/80 font-mono">FOMO {e.antiFomoScore}</span>
                {e.changePercent != null && (
                  <span
                    className={cn(
                      "font-mono",
                      e.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(e.changePercent)}
                  </span>
                )}
                <span className="ml-auto text-[9px] text-zinc-600 font-mono">+{e.ingestDelaySec}s</span>
              </div>
              <p className="text-[10px] text-zinc-500 truncate mt-0.5">{e.headline}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
