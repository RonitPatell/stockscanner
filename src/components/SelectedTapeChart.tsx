"use client";

import { LineChart } from "lucide-react";
import { TradingViewMiniChart } from "./TradingViewMiniChart";
import { tradingViewUrl } from "@/lib/chart-links";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import {
  useLiveQuotesOptional,
  useRegisterLiveSymbols,
} from "./LiveQuoteProvider";

/**
 * Always-visible 1m chart for the focused ticker (feed selection),
 * so traders don't have to discover the Decision Drawer first.
 */
export function SelectedTapeChart({
  symbol,
  headline,
  onOpenDetails,
  className,
}: {
  symbol: string;
  headline?: string | null;
  onOpenDetails?: () => void;
  className?: string;
}) {
  const sym = symbol.toUpperCase();
  useRegisterLiveSymbols("selected-tape-chart", [sym]);
  const live = useLiveQuotesOptional()[sym];

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/25 bg-[var(--bg-elevated)] overflow-hidden",
        className
      )}
      data-guide="live-tape-chart"
      data-testid="selected-tape-chart"
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)]">
        <LineChart className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
        <span className="font-mono text-[12px] font-bold text-emerald-300">
          {sym}
        </span>
        {live?.price != null && (
          <span className="font-mono text-[11px] tabular-nums text-[var(--text-primary)]">
            {formatPrice(live.price)}
          </span>
        )}
        {live?.changePercent != null && (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              live.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {formatPercent(live.changePercent)}
          </span>
        )}
        <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)]">
          Live 1m
        </span>
        <div className="ml-auto flex items-center gap-2">
          {onOpenDetails && (
            <button
              type="button"
              onClick={onOpenDetails}
              className="text-[10px] font-semibold text-emerald-400 hover:underline"
            >
              Decision drawer
            </button>
          )}
          <a
            href={tradingViewUrl(sym)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-[var(--text-secondary)] hover:text-emerald-300"
          >
            Full TV
          </a>
        </div>
      </div>
      {headline && (
        <p className="px-3 py-1 text-[10px] text-[var(--text-secondary)] line-clamp-1 border-b border-[var(--border)]">
          {headline}
        </p>
      )}
      <TradingViewMiniChart symbol={sym} height={220} />
    </div>
  );
}
