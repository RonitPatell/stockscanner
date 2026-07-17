"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Check, X } from "lucide-react";
import {
  closePaperTrade,
  listPaperTrades,
  openPaperTrade,
  paperTradeStats,
  type PaperTrade,
} from "@/lib/paper-trades";
import { cn } from "@/lib/utils";
import { useLiveQuotes } from "./LiveQuoteProvider";

export function PaperTradeLedger({ className }: { className?: string }) {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const quotes = useLiveQuotes();

  const refresh = useCallback(() => setTrades(listPaperTrades()), []);

  useEffect(() => {
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("tt-paper-trade", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tt-paper-trade", onStorage);
    };
  }, [refresh]);

  const stats = paperTradeStats(trades);
  if (trades.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-950/60 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <BookOpen className="w-3.5 h-3.5 text-zinc-300" />
        <span className="text-[11px] font-semibold text-zinc-200">Paper Trades</span>
        <span className="text-[9px] text-zinc-500">
          {stats.openCount} open · {stats.closedCount} closed
          {stats.totalPnlUsd !== 0 && (
            <span
              className={cn(
                "ml-1 font-mono",
                stats.totalPnlUsd >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {stats.totalPnlUsd >= 0 ? "+" : ""}${stats.totalPnlUsd}
            </span>
          )}
        </span>
      </div>
      <div className="max-h-36 overflow-y-auto divide-y divide-zinc-800">
        {trades.slice(0, 8).map((t) => {
          const live = quotes[t.symbol]?.price;
          return (
            <div key={t.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-white w-12">{t.symbol}</span>
              <span
                className={cn(
                  "text-[9px] uppercase",
                  t.side === "long" ? "text-emerald-400" : "text-red-400"
                )}
              >
                {t.side}
              </span>
              <span className="font-mono text-zinc-400">${t.entryPrice.toFixed(2)}</span>
              {t.status === "closed" ? (
                <span
                  className={cn(
                    "font-mono",
                    (t.pnlUsd ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {(t.pnlUsd ?? 0) >= 0 ? "+" : ""}${t.pnlUsd}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={live == null}
                  onClick={() => {
                    if (live == null) return;
                    closePaperTrade(t.id, live);
                    refresh();
                    window.dispatchEvent(new Event("tt-paper-trade"));
                  }}
                  className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:border-emerald-500/50 disabled:opacity-40"
                >
                  Close @ live
                </button>
              )}
              <span className="text-zinc-600 truncate flex-1">{t.headline}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaperTradeButtons({
  catalystId,
  symbol,
  headline,
  price,
  changePercent,
  className,
}: {
  catalystId: string;
  symbol: string;
  headline: string;
  price: number | null | undefined;
  changePercent?: number | null;
  className?: string;
}) {
  const [done, setDone] = useState<"long" | "short" | null>(null);

  if (price == null || price <= 0) return null;

  const stamp = (side: "long" | "short") => {
    openPaperTrade({
      catalystId,
      symbol,
      headline,
      side,
      entryPrice: price,
      entryChangePercent: changePercent,
    });
    setDone(side);
    window.dispatchEvent(new Event("tt-paper-trade"));
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => stamp("long")}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
      >
        {done === "long" ? <Check className="w-3 h-3" /> : null}
        Paper long
      </button>
      <button
        type="button"
        onClick={() => stamp("short")}
        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10"
      >
        {done === "short" ? <X className="w-3 h-3" /> : null}
        Paper short
      </button>
    </div>
  );
}
