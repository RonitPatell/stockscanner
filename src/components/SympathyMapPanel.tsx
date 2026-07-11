"use client";

import { useEffect, useState } from "react";
import { GitBranch, Network } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { tradingViewUrl } from "@/lib/chart-links";
import { applyLiveQuote, useLiveQuotes, useRegisterLiveSymbols } from "./LiveQuoteProvider";

interface Hub {
  symbol: string;
  mentions: number;
  changePercent: number | null;
  headline: string;
}

interface Node {
  symbol: string;
  changePercent: number | null;
  linkStrength: number;
  via: string;
  sampleHeadline: string | null;
}

export function SympathyMapPanel({
  className,
  seedSymbol,
}: {
  className?: string;
  seedSymbol?: string;
}) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [center, setCenter] = useState(seedSymbol?.toUpperCase() ?? "");
  const [nodes, setNodes] = useState<Node[]>([]);
  const liveQuotes = useLiveQuotes();

  const symbols = [
    ...hubs.map((h) => h.symbol),
    ...nodes.map((n) => n.symbol),
    ...(center ? [center] : []),
  ];
  useRegisterLiveSymbols("sympathy-map", symbols);

  useEffect(() => {
    void fetch("/api/sympathy?limit=8&hours=36")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.hubs) {
          setHubs(d.hubs);
          if (!center && d.hubs[0]?.symbol) setCenter(d.hubs[0].symbol);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!center) return;
    void fetch(`/api/sympathy?symbol=${encodeURIComponent(center)}&limit=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.nodes && setNodes(d.nodes))
      .catch(() => {});
  }, [center]);

  if (hubs.length === 0 && nodes.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-fuchsia-500/20 bg-fuchsia-500/10">
        <Network className="w-3.5 h-3.5 text-fuchsia-300" />
        <span className="text-[11px] font-semibold text-fuchsia-200">Sympathy Map</span>
        <span className="text-[9px] text-fuchsia-500/80">who moves with whom</span>
      </div>

      <div className="px-2 py-1.5 flex flex-wrap gap-1 border-b border-fuchsia-500/10">
        {hubs.map((h) => {
          const live = applyLiveQuote(h, liveQuotes);
          const active = center === h.symbol;
          return (
            <button
              key={h.symbol}
              type="button"
              onClick={() => setCenter(h.symbol)}
              className={cn(
                "text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors",
                active
                  ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-200"
                  : "border-zinc-700 text-zinc-400 hover:border-fuchsia-500/40"
              )}
            >
              {h.symbol}
              {live.changePercent != null && (
                <span
                  className={cn(
                    "ml-1",
                    live.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {formatPercent(live.changePercent)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {center && (
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 mb-2 text-[11px]">
            <GitBranch className="w-3 h-3 text-fuchsia-400" />
            <span className="font-mono font-bold text-white">{center}</span>
            <span className="text-zinc-500">→ linked names</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {nodes.length === 0 ? (
              <span className="text-[10px] text-zinc-600">No linked tickers in window</span>
            ) : (
              nodes.map((n) => {
                const live = applyLiveQuote(n, liveQuotes);
                return (
                  <a
                    key={n.symbol}
                    href={tradingViewUrl(n.symbol)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={n.sampleHeadline ?? n.via}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded border border-zinc-700 bg-zinc-950/60 hover:border-fuchsia-500/50"
                  >
                    <span className="font-mono font-bold text-zinc-200">{n.symbol}</span>
                    {live.changePercent != null && (
                      <span
                        className={cn(
                          "font-mono",
                          live.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {formatPercent(live.changePercent)}
                      </span>
                    )}
                    <span className="text-[8px] text-zinc-600">{n.via}</span>
                  </a>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
