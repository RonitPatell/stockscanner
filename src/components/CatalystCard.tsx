"use client";

import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronRight, LineChart } from "lucide-react";
import type { CatalystItem } from "@/types";
import { Badge } from "./ui/badge";
import {
  cn,
  formatMarketCap,
  formatFloat,
  formatPercent,
  formatPrice,
  timeAgo,
  getSentimentColor,
  getChangeColor,
} from "@/lib/utils";
import { formatRvol } from "@/lib/volume-utils";
import { tradingViewUrl, finvizUrl } from "@/lib/chart-links";
import { CATALYST_TYPES } from "@/types";

interface CatalystCardProps {
  catalyst: CatalystItem;
  isNew?: boolean;
  onWatchlistToggle?: (symbol: string) => void;
  inWatchlist?: boolean;
}

export function CatalystCard({
  catalyst,
  isNew,
  onWatchlistToggle,
  inWatchlist,
}: CatalystCardProps) {
  const [expanded, setExpanded] = useState(false);
  const headlines = catalyst.headlines?.length
    ? catalyst.headlines
    : [
        {
          id: catalyst.id,
          headline: catalyst.headline,
          source: catalyst.source,
          sourceUrl: catalyst.sourceUrl,
          publishedAt: catalyst.publishedAt,
          sentimentScore: catalyst.sentimentScore,
          catalystType: catalyst.catalystType,
          aiSummary: catalyst.aiSummary,
        },
      ];
  const newsCount = catalyst.newsCount ?? headlines.length;
  const catalystType = CATALYST_TYPES.find((t) => t.id === catalyst.catalystType);
  const absMove = Math.abs(catalyst.changePercent ?? 0);
  const isBigMover = absMove >= 5;
  const hotRvol = (catalyst.rVol ?? 0) >= 3;

  return (
    <div
      className={cn(
        "border-b border-zinc-800/80 last:border-b-0 transition-colors",
        isNew && "bg-emerald-500/5",
        expanded && "bg-zinc-900/60",
        inWatchlist && "ring-1 ring-inset ring-amber-500/20"
      )}
    >
      <div className="grid grid-cols-[72px_48px_52px_40px_40px_1fr_48px_24px] gap-1.5 items-center px-2.5 py-1.5 hover:bg-zinc-800/40">
        {/* Symbol — opens TradingView */}
        <div className="min-w-0">
          <a
            href={tradingViewUrl(catalyst.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open chart on TradingView"
            className="group/sym flex items-center gap-1 min-w-0"
          >
            <span className="font-mono font-bold text-white text-sm group-hover/sym:text-emerald-400 transition-colors underline-offset-2 group-hover/sym:underline">
              {catalyst.symbol}
            </span>
            <LineChart className="w-3 h-3 text-zinc-600 group-hover/sym:text-emerald-500 shrink-0 opacity-0 group-hover/sym:opacity-100 transition-opacity" />
            {isNew && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
            )}
          </a>
          {catalystType && (
            <span className="text-[9px] text-zinc-500 truncate block">
              {catalystType.icon} {catalystType.label}
            </span>
          )}
        </div>

        {/* Change % */}
        <div
          className={cn(
            "font-mono text-[11px] font-semibold text-center rounded px-0.5 py-0.5",
            isBigMover
              ? (catalyst.changePercent ?? 0) >= 0
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
              : getChangeColor(catalyst.changePercent)
          )}
        >
          {formatPercent(catalyst.changePercent)}
        </div>

        {/* Price */}
        <div className="font-mono text-[11px] text-zinc-300 text-right">
          {formatPrice(catalyst.price)}
        </div>

        {/* RVOL */}
        <div
          className={cn(
            "font-mono text-[11px] font-semibold text-center",
            hotRvol ? "text-amber-400" : "text-zinc-400"
          )}
          title="Relative volume vs session average"
        >
          {formatRvol(catalyst.rVol)}
        </div>

        {/* Sentiment */}
        <div className="text-center">
          <span
            className={cn(
              "font-mono text-[11px] font-semibold",
              getSentimentColor(catalyst.sentimentScore)
            )}
          >
            {(catalyst.sentimentScore ?? 0) >= 0 ? "+" : ""}
            {catalyst.sentimentScore?.toFixed(0) ?? "—"}
          </span>
        </div>

        {/* Headline — click to expand */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-w-0 text-left"
        >
          <p className="text-[11px] sm:text-xs text-zinc-200 truncate leading-snug">
            {newsCount > 1 && (
              <span className="text-zinc-500 mr-1">{newsCount} ·</span>
            )}
            {catalyst.headline}
          </p>
          <p className="text-[9px] text-zinc-600 truncate mt-0.5 hidden sm:block">
            {formatFloat(catalyst.floatShares)} float · {formatMarketCap(catalyst.marketCap)}
            {catalyst.isPremarket && " · PM"}
          </p>
        </button>

        {/* Time */}
        <div className="text-[9px] text-zinc-500 text-right whitespace-nowrap">
          {timeAgo(catalyst.publishedAt)}
        </div>

        {/* Expand */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex justify-center text-zinc-500 hover:text-zinc-300"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 sm:px-4 pb-3 pt-0 border-t border-zinc-800/50 bg-zinc-950/40">
          <div className="flex flex-wrap items-center gap-2 py-2">
            <a
              href={tradingViewUrl(catalyst.symbol)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
            >
              TradingView
            </a>
            <a
              href={finvizUrl(catalyst.symbol)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
            >
              Finviz
            </a>
            {onWatchlistToggle && (
              <button
                type="button"
                onClick={() => onWatchlistToggle(catalyst.symbol)}
                className={cn(
                  "text-[10px] px-2 py-1 rounded border transition-colors",
                  inWatchlist
                    ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                )}
              >
                {inWatchlist ? "★ On watchlist" : "☆ Add to watchlist"}
              </button>
            )}
          </div>

          {newsCount > 1 && (
            <div className="flex items-center gap-2 py-1 mb-1">
              <Badge
                variant={
                  (catalyst.sentimentScore ?? 0) >= 20
                    ? "bullish"
                    : (catalyst.sentimentScore ?? 0) <= -20
                      ? "bearish"
                      : "neutral"
                }
              >
                Overall {catalyst.sentimentLabel?.replace("_", " ") || "neutral"}
              </Badge>
              <span className="text-[10px] text-zinc-500">
                {newsCount} headlines · RVol {formatRvol(catalyst.rVol)}
              </span>
            </div>
          )}

          <ul className="space-y-2">
            {headlines.map((h) => {
              const type = CATALYST_TYPES.find((t) => t.id === h.catalystType);
              return (
                <li
                  key={h.id}
                  className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs sm:text-sm text-zinc-300 leading-snug flex-1">
                      {h.headline}
                    </p>
                    <span
                      className={cn(
                        "font-mono text-xs font-medium shrink-0",
                        getSentimentColor(h.sentimentScore)
                      )}
                    >
                      {(h.sentimentScore ?? 0) >= 0 ? "+" : ""}
                      {h.sentimentScore?.toFixed(0) ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-zinc-600 truncate">{h.source}</span>
                      {type && (
                        <span className="text-[10px] text-zinc-600 shrink-0">
                          {type.icon} {type.label}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600 shrink-0">
                        {timeAgo(h.publishedAt)}
                      </span>
                    </div>
                    {h.sourceUrl && (
                      <a
                        href={h.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5 shrink-0"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {h.aiSummary && (
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed border-l border-zinc-700 pl-2">
                      {h.aiSummary}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
