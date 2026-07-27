"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, Sparkles, TrendingUp } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface EdgeRow {
  id: string;
  symbol: string;
  headline: string;
  ingestDelaySec: number;
  changePercent: number;
  edgeUsd: number;
  bias: "long" | "short";
}

interface EdgeSummary {
  totalEdgeUsd: number;
  monthsCovered: number;
  paysForItself: boolean;
  sampleSize: number;
  under3mRate: number | null;
  rows: EdgeRow[];
  disclaimer: string;
  notionalUsd: number;
}

export function SpeedEdgeLedger({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<EdgeSummary | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/speed-edge?limit=6&hours=72")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setData(d))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!data || data.sampleSize === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-zinc-950/80 to-zinc-900/40 overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-2 min-w-0">
          <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-200">Speed Scenario</span>
          <span className="text-[9px] text-zinc-500 truncate">
            illustrative $1k notional · ingest vs +3m
          </span>
        </div>
        <Link href="/wins" className="text-[10px] text-emerald-500 hover:underline shrink-0">
          Proof
        </Link>
      </div>

      <div className="px-3 py-2.5 flex flex-wrap items-end gap-x-4 gap-y-1">
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">72h scenario</div>
          <div className="text-xl font-bold font-mono text-emerald-400">
            ${data.totalEdgeUsd.toFixed(0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">vs $19.99 Pro</div>
          <div className="text-sm font-semibold text-zinc-200">
            {data.paysForItself ? (
              <span className="text-emerald-400 inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                {data.monthsCovered}× covered
              </span>
            ) : (
              <span>{data.monthsCovered}× so far</span>
            )}
          </div>
        </div>
        {data.under3mRate != null && (
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Live under 3m</div>
            <div className="text-sm font-mono text-zinc-300">{data.under3mRate}%</div>
          </div>
        )}
      </div>

      {!compact && (
        <div className="max-h-36 overflow-y-auto divide-y divide-zinc-800/70 border-t border-zinc-800/80">
          {data.rows.slice(0, 5).map((r) => (
            <div key={r.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-white w-12 shrink-0">{r.symbol}</span>
              <span
                className={cn(
                  "font-mono w-14 shrink-0",
                  r.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {formatPercent(r.changePercent)}
              </span>
              <span className="text-emerald-500/90 font-mono shrink-0">+${r.edgeUsd.toFixed(0)}</span>
              <span className="text-zinc-600 truncate flex-1">{r.headline}</span>
              <span className="text-[9px] text-zinc-600 font-mono shrink-0">+{r.ingestDelaySec}s</span>
            </div>
          ))}
        </div>
      )}

      <p className="px-3 py-1.5 text-[8px] text-zinc-600 leading-snug border-t border-zinc-800/60">
        {data.disclaimer}
      </p>
    </div>
  );
}

export function SpeedEdgeHeroStat({ className }: { className?: string }) {
  const [data, setData] = useState<EdgeSummary | null>(null);

  useEffect(() => {
    void fetch("/api/speed-edge?limit=8&hours=72")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data?.paysForItself && !(data && data.totalEdgeUsd > 0)) return null;

  return (
    <div
      className={cn(
        "border mk-hairline bg-emerald-500/[0.06] px-4 py-3.5 flex items-center gap-3",
        className
      )}
    >
      <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm text-zinc-200 font-medium tracking-tight">
          Last 72h illustrative speed scenario:{" "}
          <span className="font-mono text-emerald-400">${data.totalEdgeUsd.toFixed(0)}</span>
          {data.paysForItself ? (
            <span className="text-zinc-500 font-normal">
              {" "}
              — {data.monthsCovered}× a $19.99 month on $1k notional
            </span>
          ) : null}
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5">
          Illustrative · ingest vs +3 minutes · not financial advice
        </p>
      </div>
    </div>
  );
}
