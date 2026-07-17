"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { listPaperTrades, paperTradeStats } from "@/lib/paper-trades";
import { cn } from "@/lib/utils";

interface EdgeSummary {
  totalEdgeUsd: number;
  monthsCovered: number;
  paysForItself: boolean;
}

interface DilutionItem {
  changePercent: number | null;
  symbol: string;
}

/**
 * Daily "Pro paid for itself" card — skips + speed edge + paper P&L.
 */
export function DailyEdgeRecap({ className }: { className?: string }) {
  const [edge, setEdge] = useState<EdgeSummary | null>(null);
  const [dilutionSaved, setDilutionSaved] = useState(0);
  const [dilutionCount, setDilutionCount] = useState(0);
  const [paperPnl, setPaperPnl] = useState(0);

  useEffect(() => {
    void fetch("/api/speed-edge?limit=8&hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEdge(d))
      .catch(() => {});

    void fetch("/api/dilution?limit=20&hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const items = (d?.items ?? []) as DilutionItem[];
        setDilutionCount(items.length);
        // Heuristic: skipping a chase on dilution when name is green = avoided giveback
        const saved = items.reduce((sum, i) => {
          const move = Math.abs(i.changePercent ?? 0);
          if (move < 2) return sum;
          return sum + (move / 100) * 1000 * 0.25;
        }, 0);
        setDilutionSaved(Math.round(saved * 100) / 100);
      })
      .catch(() => {});

    const stats = paperTradeStats(listPaperTrades());
    setPaperPnl(stats.totalPnlUsd);

    const onPaper = () => setPaperPnl(paperTradeStats(listPaperTrades()).totalPnlUsd);
    window.addEventListener("tt-paper-trade", onPaper);
    return () => window.removeEventListener("tt-paper-trade", onPaper);
  }, []);

  const speed = edge?.totalEdgeUsd ?? 0;
  const total = Math.round((speed + dilutionSaved + Math.max(0, paperPnl)) * 100) / 100;
  const months = total > 0 ? Math.round((total / 19.99) * 10) / 10 : 0;

  if (total <= 0 && dilutionCount === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-zinc-950 to-zinc-900/80 px-3 py-2.5 shrink-0",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-500/80">
              Daily edge recap
            </div>
            <div className="text-lg font-bold font-mono text-emerald-300">
              ${total.toFixed(0)}
              <span className="text-[11px] font-normal text-zinc-500 ml-1">
                illustrative + paper results
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-[10px] text-zinc-400">
          <span>
            Speed scenario{" "}
            <strong className="text-emerald-400 font-mono">${speed.toFixed(0)}</strong>
          </span>
          <span>
            Dilution skips ({dilutionCount}){" "}
            <strong className="text-amber-300 font-mono">~${dilutionSaved.toFixed(0)}</strong>
          </span>
          <span>
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
        </div>

        {months >= 1 && (
          <div className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" />
            {months}× a $19.99 month
          </div>
        )}
      </div>
      <p className="text-[8px] text-zinc-600 mt-1.5">
        Illustrative on $1k notional · skips estimate avoided chase risk · not financial advice
      </p>
    </div>
  );
}
