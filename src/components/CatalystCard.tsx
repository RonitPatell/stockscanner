"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  confidenceLabel,
  getSourceTier,
  sourceTierBadgeClass,
  sourceTierLabel,
} from "@/lib/source-trust";
import { setupTagMeta } from "@/lib/setup-tags";

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
  const [detail, setDetail] = useState<{
    aiSummary?: string | null;
    keyPoints?: string[];
    historicalAvgMove?: number | null;
    historicalSampleSize?: number | null;
  } | null>(null);
  const [translatedHeadline, setTranslatedHeadline] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [ageLabel, setAgeLabel] = useState(() => timeAgo(catalyst.publishedAt));

  useEffect(() => {
    setAgeLabel(timeAgo(catalyst.publishedAt));
    const id = setInterval(() => setAgeLabel(timeAgo(catalyst.publishedAt)), 1000);
    return () => clearInterval(id);
  }, [catalyst.publishedAt]);

  const sourceTier = catalyst.sourceTier
    ? (catalyst.sourceTier as "wire" | "exchange" | "aggregator" | "other")
    : getSourceTier(catalyst.source);
  const trustLabel = confidenceLabel(catalyst.verifiedConfidence);

  useEffect(() => {
    if (!expanded) return;
    if (detail || (catalyst.keyPoints?.length && catalyst.aiSummary)) return;
    let cancelled = false;
    void fetch(`/api/catalysts/${catalyst.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [expanded, catalyst.id, catalyst.keyPoints, catalyst.aiSummary, detail]);

  const displaySummary = detail?.aiSummary ?? catalyst.aiSummary;
  const displayKeyPoints = detail?.keyPoints ?? catalyst.keyPoints;
  const displayHistMove = detail?.historicalAvgMove ?? catalyst.historicalAvgMove;
  const displayHistN = detail?.historicalSampleSize ?? catalyst.historicalSampleSize;

  const shouldTranslate = useMemo(() => {
    const h = catalyst.headline ?? "";
    // fast heuristic: any non-ASCII letter
    return /[^\x00-\x7F]/.test(h);
  }, [catalyst.headline]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!shouldTranslate) {
        setTranslatedHeadline(null);
        setDetectedLang(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/translate?to=en&text=${encodeURIComponent(catalyst.headline)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.translated === "string" && data.translated.trim()) {
          setTranslatedHeadline(data.translated);
          setDetectedLang(typeof data.detectedLang === "string" ? data.detectedLang : null);
        }
      } catch {
        /* ignore */
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [shouldTranslate, catalyst.headline]);

  const headlineText =
    translatedHeadline && !showOriginal ? translatedHeadline : catalyst.headline;
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
            "font-mono text-[11px] font-semibold text-center rounded px-0.5 py-0.5 transition-colors duration-500",
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
        <div className="font-mono text-[11px] text-zinc-300 text-right tabular-nums transition-colors duration-500">
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
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="min-w-0 w-full text-left"
          >
            <p className="text-[11px] sm:text-xs text-zinc-200 truncate leading-snug">
              {newsCount > 1 && (
                <span className="text-zinc-500 mr-1">{newsCount} ·</span>
              )}
              {headlineText}
              {translatedHeadline && (
                <span className="ml-1 text-[9px] text-zinc-500">
                  · Translated{detectedLang ? ` (${detectedLang})` : ""}
                </span>
              )}
            </p>
            <p className="text-[9px] text-zinc-600 truncate mt-0.5 hidden sm:block">
              {formatFloat(catalyst.floatShares)} float · {formatMarketCap(catalyst.marketCap)}
              {catalyst.isPremarket && " · PM"}
              {catalyst.setupTags?.length ? (
                <span className="ml-1">
                  ·{" "}
                  {catalyst.setupTags.slice(0, 3).map((tag) => {
                    const meta = setupTagMeta(tag);
                    return meta ? `${meta.icon}${meta.label}` : tag;
                  }).join(" ")}
                </span>
              ) : null}
            </p>
          </button>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            <span
              className={cn(
                "text-[8px] px-1 py-0 rounded border uppercase tracking-wide",
                sourceTierBadgeClass(sourceTier)
              )}
            >
              {sourceTierLabel(sourceTier)}
            </span>
            {trustLabel && (
              <span className="text-[8px] px-1 py-0 rounded border border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                {trustLabel}
              </span>
            )}
            {catalyst.newsCount && catalyst.newsCount > 1 && (
              <span className="text-[8px] text-violet-400">
                {catalyst.newsCount} sources
              </span>
            )}
          </div>
          {translatedHeadline && (
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="text-[9px] text-zinc-600 hover:text-zinc-300"
              >
                {showOriginal ? "Show translation" : "Show original"}
              </button>
            </div>
          )}
          {catalyst.relatedSymbols && catalyst.relatedSymbols.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5 min-w-0 overflow-hidden">
              <span className="text-[9px] text-zinc-600 shrink-0">Also</span>
              {catalyst.relatedSymbols.slice(0, 6).map((sym) => (
                <a
                  key={sym}
                  href={tradingViewUrl(sym)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[9px] text-zinc-400 hover:text-emerald-400 px-1 rounded bg-zinc-800/80 border border-zinc-700/60 shrink-0"
                  title={`Open ${sym} on TradingView`}
                >
                  {sym}
                </a>
              ))}
              {catalyst.relatedSymbols.length > 6 && (
                <span className="text-[9px] text-zinc-600 shrink-0">
                  +{catalyst.relatedSymbols.length - 6}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Time */}
        <div className="text-[9px] text-zinc-500 text-right whitespace-nowrap tabular-nums">
          {ageLabel}
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

          {(displayHistMove != null || displayHistN != null) && (
            <div className="pb-2">
              <p className="text-[10px] text-zinc-500">
                Historical move for this catalyst type:{" "}
                <span className="text-zinc-300 font-mono">
                  {displayHistMove != null
                    ? `${displayHistMove.toFixed(1)}% avg`
                    : "—"}
                </span>
                {displayHistN != null && displayHistN > 0 && (
                  <span className="text-zinc-600">
                    {" "}
                    · n={displayHistN}
                  </span>
                )}
              </p>
            </div>
          )}

          {displayKeyPoints && displayKeyPoints.length > 0 && (
            <div className="pb-2">
              <p className="text-[10px] text-zinc-500 mb-1">Key points</p>
              <ul className="list-disc list-inside space-y-0.5">
                {displayKeyPoints.slice(0, 4).map((pt) => (
                  <li key={pt} className="text-[10px] text-zinc-300">
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {displaySummary && !headlineText.includes(displaySummary.slice(0, 40)) && (
            <p className="text-[10px] text-zinc-400 pb-2 leading-snug">{displaySummary}</p>
          )}

          {catalyst.relatedSymbols && catalyst.relatedSymbols.length > 0 && (
            <div className="pb-2">
              <p className="text-[10px] text-zinc-500 mb-1.5">
                Verified tickers in this article
              </p>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={tradingViewUrl(catalyst.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                >
                  {catalyst.symbol}
                </a>
                {catalyst.relatedSymbols.map((sym) => (
                  <a
                    key={sym}
                    href={tradingViewUrl(sym)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
                  >
                    {sym}
                  </a>
                ))}
              </div>
            </div>
          )}

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
