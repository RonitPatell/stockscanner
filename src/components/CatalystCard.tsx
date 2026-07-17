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
  safeHttpUrl,
} from "@/lib/utils";
import { formatRvol } from "@/lib/volume-utils";
import { brokerDeepLinks, tradingViewUrl } from "@/lib/chart-links";
import { CATALYST_TYPES } from "@/types";
import {
  confidenceLabel,
  getSourceTier,
  sourceTierBadgeClass,
  sourceTierLabel,
} from "@/lib/source-trust";
import { setupTagMeta } from "@/lib/setup-tags";
import { CatalystPlaybookPanel } from "./CatalystPlaybookPanel";
import { ActionPlaybookCard } from "./ActionPlaybookCard";
import { PaperTradeButtons } from "./PaperTradeLedger";
import { PostCallButton } from "./CallBoard";
import { pickLiveField, useLiveQuotesOptional } from "./LiveQuoteProvider";
import { antiFomoClass, buildActionPlaybook } from "@/lib/action-playbook";

interface CatalystCardProps {
  catalyst: CatalystItem;
  isNew?: boolean;
  onWatchlistToggle?: (symbol: string) => void;
  inWatchlist?: boolean;
  /** Static demo page — no API calls */
  demoMode?: boolean;
  /** Keyboard focus highlight */
  highlighted?: boolean;
  /** Controlled expand from hotkeys */
  forceExpanded?: boolean;
}

export function CatalystCard({
  catalyst,
  isNew,
  onWatchlistToggle,
  inWatchlist,
  demoMode = false,
  highlighted = false,
  forceExpanded,
}: CatalystCardProps) {
  const liveQuotes = useLiveQuotesOptional();
  const price = pickLiveField(catalyst.symbol, liveQuotes, "price", catalyst.price);
  const changePercent = pickLiveField(
    catalyst.symbol,
    liveQuotes,
    "changePercent",
    catalyst.changePercent
  );
  const rVol = pickLiveField(catalyst.symbol, liveQuotes, "rVol", catalyst.rVol);
  const floatShares = pickLiveField(
    catalyst.symbol,
    liveQuotes,
    "floatShares",
    catalyst.floatShares
  );
  const marketCap = pickLiveField(
    catalyst.symbol,
    liveQuotes,
    "marketCap",
    catalyst.marketCap
  );
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
  const [mounted, setMounted] = useState(false);
  const [ageLabel, setAgeLabel] = useState("");

  useEffect(() => {
    if (forceExpanded === undefined) return;
    setExpanded(forceExpanded);
  }, [forceExpanded, catalyst.id]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const tick = () => setAgeLabel(timeAgo(catalyst.publishedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [catalyst.publishedAt, mounted]);

  const sourceTier = catalyst.sourceTier
    ? (catalyst.sourceTier as "wire" | "exchange" | "aggregator" | "other")
    : getSourceTier(catalyst.source);
  const trustLabel = confidenceLabel(catalyst.verifiedConfidence);

  useEffect(() => {
    if (demoMode || !expanded) return;
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
  }, [demoMode, expanded, catalyst.id, catalyst.keyPoints, catalyst.aiSummary, detail]);

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
    if (demoMode) return;
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
  }, [demoMode, shouldTranslate, catalyst.headline]);

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
  const absMove = Math.abs(changePercent ?? 0);
  const isBigMover = absMove >= 5;
  const hotRvol = (rVol ?? 0) >= 3;

  return (
    <div
      className={cn(
        "border-b border-[--border] last:border-b-0 transition-colors",
        isNew && "bg-[--accent-subtle] new-row",
        expanded && "bg-white/[0.025]",
        highlighted && "ring-1 ring-inset ring-[--accent]/40 bg-[--accent-subtle]",
        inWatchlist && "ring-1 ring-inset ring-amber-500/18"
      )}
    >
      <div className="sm:hidden px-3 py-3 hover:bg-white/[0.025]">
        <div className="flex items-start gap-2.5 min-w-0">
          <a
            href={tradingViewUrl(catalyst.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-[58px] shrink-0"
            title="Open chart on TradingView"
          >
            <span className="block font-mono font-bold text-[15px] text-white">
              {catalyst.symbol}
            </span>
            <span className="block text-[10px] text-[--text-tertiary] truncate mt-0.5">
              {catalystType
                ? catalystType.icon + " " + catalystType.label
                : catalyst.source}
            </span>
          </a>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block text-[12px] leading-[1.4] text-[--text-primary] line-clamp-2">
              {headlineText}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "font-mono text-[11px] font-bold tabular-nums",
                  getChangeColor(changePercent)
                )}
              >
                {formatPercent(changePercent)}
              </span>
              <span className="font-mono text-[11px] text-[--text-secondary] tabular-nums">
                {formatPrice(price)}
              </span>
              <span className={cn("font-mono text-[11px]", hotRvol ? "text-amber-400" : "text-[--text-tertiary]")}>
                {formatRvol(rVol)} RVOL
              </span>
              <span className={cn("font-mono text-[11px]", getSentimentColor(catalyst.sentimentScore))}>
                {(catalyst.sentimentScore ?? 0) >= 0 ? "+" : ""}
                {catalyst.sentimentScore?.toFixed(0) ?? "—"} impact
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md border border-[--border] text-[--text-tertiary]"
            aria-label={expanded ? "Collapse catalyst" : "Expand catalyst"}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex items-center gap-1.5 mt-2 min-w-0">
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded border uppercase font-semibold", sourceTierBadgeClass(sourceTier))}>
            {sourceTierLabel(sourceTier)}
          </span>
          {catalyst.newsCount && catalyst.newsCount > 1 ? (
            <span className="text-[9px] text-violet-400">{catalyst.newsCount} sources</span>
          ) : null}
          <FomoBadge catalyst={catalyst} changePercent={changePercent} rVol={rVol} floatShares={floatShares} />
          <span className="ml-auto text-[9px] text-[--text-muted] font-mono whitespace-nowrap">
            {mounted ? ageLabel : "…"}
            {catalyst.ingestDelaySec != null && catalyst.ingestDelaySec < 120
              ? " · +" + catalyst.ingestDelaySec + "s"
              : ""}
          </span>
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-[80px_54px_58px_44px_44px_1fr_54px_28px] gap-2 items-center px-4 py-3 hover:bg-white/[0.025]">
        {/* Symbol — opens TradingView */}
        <div className="min-w-0">
          <a
            href={tradingViewUrl(catalyst.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open chart on TradingView"
            className="group/sym flex items-center gap-1.5 min-w-0"
          >
            <span className="font-mono font-bold text-white text-[15px] group-hover/sym:text-[--accent-bright] transition-colors underline-offset-2 group-hover/sym:underline">
              {catalyst.symbol}
            </span>
            <LineChart className="w-3.5 h-3.5 text-[--text-muted] group-hover/sym:text-[--accent] shrink-0 opacity-0 group-hover/sym:opacity-100 transition-opacity" />
            {isNew && (
              <span className="w-2 h-2 rounded-full bg-[--accent] shrink-0 animate-pulse" />
            )}
          </a>
          {catalystType && (
            <span className="text-[11px] text-[--text-tertiary] truncate block mt-0.5">
              {catalystType.icon} {catalystType.label}
            </span>
          )}
        </div>

        {/* Change % */}
        <div
          className={cn(
            "font-mono text-[13px] font-semibold text-center rounded-lg px-1 py-1 transition-colors duration-500 tabular-nums",
            isBigMover
              ? (changePercent ?? 0) >= 0
                ? "bg-[--bull-dim] text-[--bull]"
                : "bg-[--bear-dim] text-[--bear]"
              : getChangeColor(changePercent)
          )}
        >
          {formatPercent(changePercent)}
        </div>

        {/* Price */}
        <div className="font-mono text-[13px] text-[--text-secondary] text-right tabular-nums transition-colors duration-500">
          {formatPrice(price)}
        </div>

        {/* RVOL */}
        <div
          className={cn(
            "font-mono text-[13px] font-semibold text-center tabular-nums",
            hotRvol ? "text-amber-400" : "text-[--text-secondary]"
          )}
          title="Relative volume vs session average"
        >
          {formatRvol(rVol)}
        </div>

        {/* Sentiment */}
        <div className="text-center">
          <span
            className={cn(
              "font-mono text-[13px] font-semibold tabular-nums",
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
            <p className="text-[13px] text-[--text-primary] truncate leading-snug">
              {newsCount > 1 && (
                <span className="text-[--text-tertiary] mr-1.5">{newsCount} ·</span>
              )}
              {headlineText}
              {translatedHeadline && (
                <span className="ml-1.5 text-[11px] text-[--text-tertiary]">
                  · Translated{detectedLang ? ` (${detectedLang})` : ""}
                </span>
              )}
            </p>
            <p className="text-[11px] text-[--text-tertiary] truncate mt-0.5 hidden sm:block">
              {formatFloat(floatShares)} float · {formatMarketCap(marketCap)}
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
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-md border uppercase tracking-wide font-semibold",
                sourceTierBadgeClass(sourceTier)
              )}
            >
              {sourceTierLabel(sourceTier)}
            </span>
            {trustLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-cyan-500/30 text-cyan-400 bg-cyan-500/10 font-medium">
                {trustLabel}
              </span>
            )}
            {catalyst.newsCount && catalyst.newsCount > 1 && (
              <span className="text-[10px] text-violet-400 font-medium">
                {catalyst.newsCount} sources
              </span>
            )}
            <FomoBadge catalyst={catalyst} changePercent={changePercent} rVol={rVol} floatShares={floatShares} />
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
          {mounted ? ageLabel : "…"}
          {catalyst.ingestDelaySec != null && catalyst.ingestDelaySec < 120 && (
            <span className="block text-emerald-500/80" title="Publish → ingest delay">
              +{catalyst.ingestDelaySec}s
            </span>
          )}
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
            {brokerDeepLinks(catalyst.symbol).map((link) => (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] px-2 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors"
              >
                {link.label}
              </a>
            ))}
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
            {!demoMode && (
              <>
                <PaperTradeButtons
                  catalystId={catalyst.id}
                  symbol={catalyst.symbol}
                  headline={catalyst.headline}
                  price={price}
                  changePercent={changePercent}
                />
                <PostCallButton symbol={catalyst.symbol} headline={catalyst.headline} bias="long" />
                <PostCallButton symbol={catalyst.symbol} headline={catalyst.headline} bias="short" />
              </>
            )}
          </div>

          <ActionPlaybookCard
            catalyst={{
              ...catalyst,
              price,
              changePercent,
              rVol,
              floatShares,
              marketCap,
            }}
            className="mb-2"
          />

          <CatalystPlaybookPanel
            catalystType={catalyst.catalystType}
            floatShares={floatShares}
            className="mb-2"
          />

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
                {newsCount} headlines · RVol {formatRvol(rVol)}
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
                        {mounted ? timeAgo(h.publishedAt) : "…"}
                      </span>
                    </div>
                    {safeHttpUrl(h.sourceUrl) && (
                      <a
                        href={safeHttpUrl(h.sourceUrl)!}
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

function FomoBadge({
  catalyst,
  changePercent,
  rVol,
  floatShares,
}: {
  catalyst: CatalystItem;
  changePercent: number | null | undefined;
  rVol: number | null | undefined;
  floatShares: number | null | undefined;
}) {
  const playbook = useMemo(
    () =>
      buildActionPlaybook({
        ...catalyst,
        changePercent: changePercent ?? catalyst.changePercent,
        rVol: rVol ?? catalyst.rVol,
        floatShares: floatShares ?? catalyst.floatShares,
      }),
    [catalyst, changePercent, rVol, floatShares]
  );
  if (playbook.antiFomoScore < 55) return null;
  return (
    <span
      className={cn(
        "text-[8px] px-1 py-0 rounded border font-mono",
        antiFomoClass(playbook.antiFomoScore)
      )}
    >
      FOMO {playbook.antiFomoScore}
    </span>
  );
}
