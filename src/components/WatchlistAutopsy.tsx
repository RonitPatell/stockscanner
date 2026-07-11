"use client";

import { useEffect, useState } from "react";
import { Crosshair, Stethoscope } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { applyLiveQuote, useLiveQuotes, useRegisterLiveSymbols } from "./LiveQuoteProvider";

interface AutopsyItem {
  id: string;
  symbol: string;
  headline: string;
  changePercent: number | null;
  bias: string;
  antiFomoScore: number;
  lesson: string;
  ingestDelaySec: number;
}

export function WatchlistAutopsy({
  className,
  symbols,
}: {
  className?: string;
  /** Optional override; otherwise API uses session watchlist */
  symbols?: string[];
}) {
  const [message, setMessage] = useState("Loading autopsy…");
  const [items, setItems] = useState<AutopsyItem[]>([]);
  const liveQuotes = useLiveQuotes();
  useRegisterLiveSymbols(
    "watchlist-autopsy",
    items.map((i) => i.symbol)
  );

  useEffect(() => {
    const qs = symbols?.length
      ? `?symbols=${encodeURIComponent(symbols.join(","))}&limit=8`
      : "?limit=8";
    const load = () => {
      void fetch(`/api/autopsy${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setMessage(d.message ?? "");
          setItems(d.items ?? []);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 25_000);
    return () => clearInterval(t);
  }, [symbols?.join(",")]);

  return (
    <div
      className={cn(
        "rounded-lg border border-cyan-500/25 bg-cyan-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/20 bg-cyan-500/10">
        <Stethoscope className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[11px] font-semibold text-cyan-200">Watchlist Autopsy</span>
        <span className="text-[9px] text-cyan-600 truncate">{message}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-[10px] text-zinc-500">{message}</p>
      ) : (
        <div className="max-h-44 overflow-y-auto divide-y divide-cyan-500/10">
          {items.map((raw) => {
            const i = applyLiveQuote(raw, liveQuotes);
            const chg = i.changePercent ?? raw.changePercent;
            return (
              <div key={raw.id} className="px-3 py-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <Crosshair className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="font-mono font-bold text-white">{raw.symbol}</span>
                  {chg != null && (
                    <span
                      className={cn(
                        "font-mono",
                        chg >= 0 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatPercent(chg)}
                    </span>
                  )}
                  <span className="text-[9px] uppercase text-zinc-500">{raw.bias}</span>
                  <span className="text-[9px] text-amber-400/80 font-mono">
                    FOMO {raw.antiFomoScore}
                  </span>
                  <span className="text-zinc-600 truncate flex-1">{raw.headline}</span>
                </div>
                <p className="text-[9px] text-cyan-600/90 pl-5 mt-0.5">{raw.lesson}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
