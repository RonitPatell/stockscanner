"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row {
  symbol: string;
  headline: string;
  priceAtIngest: number | null;
  pricePlus3m: number | null;
  edgeUsd: number | null;
  verified: boolean;
  ingestDelaySec: number;
}

interface Result {
  verifiedCount: number;
  totalEdgeUsd: number;
  monthsCovered: number;
  paysForItself: boolean;
  rows: Row[];
  disclaimer: string;
}

export function SpeedBacktestPanel({ className }: { className?: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/speed-backtest?limit=5&hours=36")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={cn("rounded-lg border border-zinc-800 px-3 py-2 text-[10px] text-zinc-500", className)}>
        Verifying speed edge with 1-minute candles…
      </div>
    );
  }

  if (!data || data.verifiedCount === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-lime-500/25 bg-lime-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-lime-500/20 bg-lime-500/10">
        <FlaskConical className="w-3.5 h-3.5 text-lime-400" />
        <span className="text-[11px] font-semibold text-lime-200">Verified Speed Edge</span>
        <span className="text-[9px] text-lime-600">1m candles · ingest → +3m</span>
        <span className="ml-auto font-mono text-[11px] text-lime-300">
          ${data.totalEdgeUsd.toFixed(0)}
          {data.paysForItself ? ` · ${data.monthsCovered}× Pro` : ""}
        </span>
      </div>
      <div className="max-h-36 overflow-y-auto divide-y divide-lime-500/10">
        {data.rows
          .filter((r) => r.verified)
          .map((r) => (
            <div key={r.symbol + r.ingestDelaySec} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-white w-12">{r.symbol}</span>
              <span className="font-mono text-zinc-500 text-[10px]">
                ${r.priceAtIngest?.toFixed(2)} → ${r.pricePlus3m?.toFixed(2)}
              </span>
              <span className="font-mono text-lime-400">+${r.edgeUsd?.toFixed(0)}</span>
              <span className="text-zinc-600 truncate flex-1">{r.headline}</span>
            </div>
          ))}
      </div>
      <p className="px-3 py-1 text-[8px] text-zinc-600">{data.disclaimer}</p>
    </div>
  );
}
