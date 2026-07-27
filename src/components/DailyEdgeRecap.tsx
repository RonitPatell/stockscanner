"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { listPaperTrades, paperTradeStats } from "@/lib/paper-trades";
import { cn } from "@/lib/utils";

interface CalibrationSummary {
  sampleSize: number;
  eligibleUrgent: number;
  medianAbsReturnPct: number | null;
  meanAbsReturnPct: number | null;
  reactionRate: number | null;
  precision: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  insufficientSample: boolean;
  meanSpyRelativePct: number | null;
  primaryHorizon: string;
  disclaimer: string;
  illustrativeNotionalUsd: number;
  illustrativeReactionUsd: number | null;
  bySession: Array<{ session: string; n: number; medianAbsReturnPct: number | null }>;
}

interface EdgeSummary {
  totalEdgeUsd: number;
  monthsCovered: number;
}

/**
 * Default: normalized price-reaction calibration.
 * Optional toggle: illustrative $1k notional / legacy Daily Edge math.
 */
export function DailyEdgeRecap({ className }: { className?: string }) {
  const [cal, setCal] = useState<CalibrationSummary | null>(null);
  const [showIllustrative, setShowIllustrative] = useState(false);
  const [edge, setEdge] = useState<EdgeSummary | null>(null);
  const [dilutionSaved, setDilutionSaved] = useState(0);
  const [dilutionCount, setDilutionCount] = useState(0);
  const [paperPnl, setPaperPnl] = useState(0);

  useEffect(() => {
    void fetch("/api/calibration?hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCal(d))
      .catch(() => {});

    const stats = paperTradeStats(listPaperTrades());
    setPaperPnl(stats.totalPnlUsd);
    const onPaper = () => setPaperPnl(paperTradeStats(listPaperTrades()).totalPnlUsd);
    window.addEventListener("tt-paper-trade", onPaper);
    return () => window.removeEventListener("tt-paper-trade", onPaper);
  }, []);

  useEffect(() => {
    if (!showIllustrative) return;
    void fetch("/api/speed-edge?limit=8&hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEdge(d))
      .catch(() => {});

    void fetch("/api/dilution?limit=20&hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const items = (d?.items ?? []) as { changePercent: number | null }[];
        setDilutionCount(items.length);
        const saved = items.reduce((sum, i) => {
          const move = Math.abs(i.changePercent ?? 0);
          if (move < 2) return sum;
          return sum + (move / 100) * 1000 * 0.25;
        }, 0);
        setDilutionSaved(Math.round(saved * 100) / 100);
      })
      .catch(() => {});
  }, [showIllustrative]);

  const speed = edge?.totalEdgeUsd ?? 0;
  const illustrativeTotal =
    Math.round((speed + dilutionSaved + Math.max(0, paperPnl)) * 100) / 100;

  if (!cal && !showIllustrative) return null;
  if (cal && cal.sampleSize === 0 && !showIllustrative) {
    // Still show shell so traders know calibration is collecting
  }

  const pct = (n: number | null | undefined, digits = 1) =>
    n == null ? "—" : `${n.toFixed(digits)}%`;

  return (
    <div
      className={cn(
        "rounded-lg border border-sky-500/25 bg-gradient-to-r from-sky-500/10 via-zinc-950 to-zinc-900/80 px-3 py-2.5 shrink-0",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-sky-500/80">
              Catalyst reaction · {cal?.primaryHorizon ?? "+15m"}
            </div>
            <div className="text-lg font-bold font-mono text-sky-200">
              {pct(cal?.medianAbsReturnPct)}
              <span className="text-[11px] font-normal text-zinc-500 ml-1">
                median |return|
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-[10px] text-zinc-400">
          <span>
            n={" "}
            <strong className="text-zinc-200 font-mono">{cal?.sampleSize ?? 0}</strong>
            {cal?.insufficientSample ? (
              <span className="text-amber-500/80 ml-1">low sample</span>
            ) : null}
          </span>
          <span>
            reaction{" "}
            <strong className="text-sky-300 font-mono">
              {cal?.reactionRate != null
                ? `${(cal.reactionRate * 100).toFixed(0)}%`
                : "—"}
            </strong>
          </span>
          {cal?.precision != null && (
            <span>
              precision{" "}
              <strong className="text-emerald-300 font-mono">
                {(cal.precision * 100).toFixed(0)}%
              </strong>
              {cal.ciLow != null && cal.ciHigh != null && (
                <span className="text-zinc-600 ml-1">
                  CI {(cal.ciLow * 100).toFixed(0)}–{(cal.ciHigh * 100).toFixed(0)}%
                </span>
              )}
            </span>
          )}
          {cal?.meanSpyRelativePct != null && (
            <span>
              vs SPY{" "}
              <strong className="font-mono text-zinc-300">
                {cal.meanSpyRelativePct >= 0 ? "+" : ""}
                {cal.meanSpyRelativePct.toFixed(1)}%
              </strong>
            </span>
          )}
        </div>

        <label className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-zinc-600"
            checked={showIllustrative}
            onChange={(e) => setShowIllustrative(e.target.checked)}
          />
          Illustrative $ view
        </label>
      </div>

      {showIllustrative && (
        <div className="mt-2 pt-2 border-t border-zinc-800 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-200/90">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            Optional illustrative notional ($
            {cal?.illustrativeNotionalUsd ?? 1000})
          </div>
          <span className="text-[10px] text-zinc-400">
            Speed scenario{" "}
            <strong className="text-emerald-400 font-mono">${speed.toFixed(0)}</strong>
          </span>
          <span className="text-[10px] text-zinc-400">
            Dilution skips ({dilutionCount}){" "}
            <strong className="text-amber-300 font-mono">~${dilutionSaved.toFixed(0)}</strong>
          </span>
          <span className="text-[10px] text-zinc-400">
            Paper P&amp;L{" "}
            <strong
              className={cn(
                "font-mono",
                paperPnl >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {paperPnl >= 0 ? "+" : ""}${paperPnl.toFixed(0)}
            </strong>
          </span>
          <span className="text-[10px] text-zinc-500">
            Combined ~${illustrativeTotal.toFixed(0)} · not brokerage P&amp;L
          </span>
        </div>
      )}

      <p className="text-[8px] text-zinc-600 mt-1.5">
        {cal?.disclaimer ??
          "Calibration measures price reaction after classified catalysts — not a profit guarantee."}
      </p>
    </div>
  );
}
