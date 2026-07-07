"use client";

import { useState } from "react";
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Flame,
} from "lucide-react";
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
  getSentimentBg,
  getChangeColor,
} from "@/lib/utils";
import { CATALYST_TYPES } from "@/types";

interface CatalystCardProps {
  catalyst: CatalystItem;
  isNew?: boolean;
}

export function CatalystCard({ catalyst, isNew }: CatalystCardProps) {
  const [expanded, setExpanded] = useState(false);

  const catalystType = CATALYST_TYPES.find((t) => t.id === catalyst.catalystType);
  const sentimentVariant =
    (catalyst.sentimentScore ?? 0) >= 20
      ? "bullish"
      : (catalyst.sentimentScore ?? 0) <= -20
        ? "bearish"
        : "neutral";

  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-zinc-900/50 backdrop-blur-sm transition-all duration-300 hover:bg-zinc-900/80 hover:border-zinc-600",
        isNew && "ring-2 ring-emerald-500/50 animate-in fade-in slide-in-from-top-2",
        catalyst.urgencyScore && catalyst.urgencyScore >= 80 && "border-amber-500/30"
      )}
    >
      {isNew && (
        <div className="absolute -top-2 -right-2 z-10">
          <Badge variant="urgent">NEW</Badge>
        </div>
      )}

      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold font-mono text-white tracking-wide">
              {catalyst.symbol}
            </span>
            {catalyst.isPremarket && <Badge variant="urgent">PREMARKET</Badge>}
            {catalystType && (
              <Badge variant="default">
                {catalystType.icon} {catalystType.label}
              </Badge>
            )}
            {(catalyst.urgencyScore ?? 0) >= 75 && (
              <Flame className="w-4 h-4 text-amber-400" />
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-lg font-semibold text-white">
              {formatPrice(catalyst.price)}
            </div>
            <div className={cn("font-mono text-sm font-medium", getChangeColor(catalyst.changePercent))}>
              {formatPercent(catalyst.changePercent)}
            </div>
          </div>
        </div>

        {/* Headline */}
        <h3 className="text-sm sm:text-base font-medium text-zinc-100 leading-snug mb-3 line-clamp-2">
          {catalyst.headline}
        </h3>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <MetricPill
            label="Sentiment"
            value={`${catalyst.sentimentScore?.toFixed(0) ?? "—"}`}
            icon={(catalyst.sentimentScore ?? 0) >= 0 ? TrendingUp : TrendingDown}
            className={getSentimentBg(catalyst.sentimentScore)}
            valueClass={getSentimentColor(catalyst.sentimentScore)}
          />
          <MetricPill label="Mkt Cap" value={formatMarketCap(catalyst.marketCap)} icon={BarChart3} />
          <MetricPill label="Float" value={formatFloat(catalyst.floatShares)} />
          <MetricPill label="Time" value={timeAgo(catalyst.publishedAt)} icon={Clock} />
        </div>

        {/* Historical similar */}
        {catalyst.historicalAvgMove != null && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3 bg-zinc-800/50 rounded-lg px-3 py-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span>
              Historically similar {catalystType?.label?.toLowerCase() || "news"} caused{" "}
              <span className={catalyst.historicalAvgMove >= 0 ? "text-emerald-400" : "text-red-400"}>
                {formatPercent(catalyst.historicalAvgMove)}
              </span>{" "}
              avg move (n={catalyst.historicalSampleSize?.toLocaleString()})
            </span>
          </div>
        )}

        {/* AI Summary expandable */}
        {catalyst.aiSummary && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Analysis
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {expanded && (
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed border-l-2 border-emerald-500/30 pl-3">
                {catalyst.aiSummary}
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <Badge variant={sentimentVariant}>
              {catalyst.sentimentLabel?.replace("_", " ") || "neutral"}
            </Badge>
            <span className="text-xs text-zinc-600">{catalyst.source}</span>
          </div>
          {catalyst.sourceUrl && (
            <a
              href={catalyst.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
            >
              Source <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function MetricPill({
  label,
  value,
  icon: Icon,
  className,
  valueClass,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  valueClass?: string;
}) {
  return (
    <div className={cn("rounded-lg px-2.5 py-1.5 border border-zinc-800 bg-zinc-800/30", className)}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={cn("text-sm font-mono font-medium text-zinc-200", valueClass)}>{value}</div>
    </div>
  );
}
