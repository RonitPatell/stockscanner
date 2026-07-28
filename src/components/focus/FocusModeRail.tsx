"use client";

import { useMemo } from "react";
import type { CatalystItem } from "@/types";
import {
  FOCUS_MAX_ACTIVE,
  FOCUS_MODE_VERSION,
  selectFocusActive,
  shouldWarnDisconnect,
  type DeliveryHealth,
} from "@/lib/focus-mode";
import { cn, formatPercent, formatPrice } from "@/lib/utils";

interface Props {
  catalysts: CatalystItem[];
  watchlist: string[];
  health: DeliveryHealth;
  focusIndex: number;
  onSelect: (index: number) => void;
  onOpenSource: (c: CatalystItem) => void;
  onTradingView: (c: CatalystItem) => void;
  onWatchlist: (symbol: string) => void;
  onMute: (symbol: string) => void;
  onEvidence: (c: CatalystItem) => void;
  className?: string;
}

export function FocusModeRail({
  catalysts,
  watchlist,
  health,
  focusIndex,
  onSelect,
  onOpenSource,
  onTradingView,
  onWatchlist,
  onMute,
  onEvidence,
  className,
}: Props) {
  const active = useMemo(
    () => selectFocusActive(catalysts, { watchlist }),
    [catalysts, watchlist]
  );
  const warn = shouldWarnDisconnect(health);
  const lastEvent =
    health.lastEventAt != null
      ? new Date(health.lastEventAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "America/New_York",
        }) + " ET"
      : "—";

  return (
    <section
      className={cn("flex flex-col min-h-0 gap-2", className)}
      data-guide="focus-mode-rail"
      aria-label="Focus mode active catalysts"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-semibold text-[--text-primary]">
            Focus Mode
          </h2>
          <p className="text-[10px] text-[--text-muted]">
            Top {FOCUS_MAX_ACTIVE} by watchlist match, freshness & materiality ·{" "}
            {FOCUS_MODE_VERSION}
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-[11px]"
          role="status"
          aria-live="polite"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              health.state === "connected"
                ? "bg-emerald-400 animate-pulse"
                : health.state === "connecting"
                  ? "bg-amber-400"
                  : "bg-red-400"
            )}
            aria-hidden
          />
          <span className="text-[--text-secondary]">
            {health.state === "connected"
              ? "Live"
              : health.state === "connecting"
                ? "Connecting"
                : health.state === "unsupported"
                  ? "Unsupported"
                  : "Disconnected"}
          </span>
          <span className="text-[--text-muted] font-mono tabular-nums">
            Last event {lastEvent}
          </span>
        </div>
      </div>

      {warn && health.warning && (
        <div
          className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-100"
          role="alert"
        >
          {health.warning}
        </div>
      )}

      <p className="text-[10px] text-[--text-muted] px-1">
        Hotkeys: <kbd className="font-mono">O</kbd> source ·{" "}
        <kbd className="font-mono">T</kbd> TradingView ·{" "}
        <kbd className="font-mono">W</kbd> watchlist ·{" "}
        <kbd className="font-mono">U</kbd> mute ·{" "}
        <kbd className="font-mono">E</kbd> evidence · j/k navigate
      </p>

      <ul className="flex flex-col gap-1.5 min-h-0 overflow-auto" role="list">
        {active.length === 0 && (
          <li className="text-[11px] text-[--text-muted] px-2 py-4">
            No active catalysts in focus set.
          </li>
        )}
        {active.map((c, idx) => {
          const selected = idx === focusIndex;
          return (
            <li key={c.id}>
              <button
                type="button"
                data-focus-idx={idx}
                onClick={() => onSelect(idx)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                  selected
                    ? "border-emerald-600/60 bg-emerald-950/30"
                    : "border-[--border] bg-black/20 hover:bg-white/[0.03]"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-semibold text-[--text-primary]">
                    {c.symbol}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      (c.changePercent ?? 0) >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    )}
                  >
                    {c.changePercent != null
                      ? formatPercent(c.changePercent)
                      : "—"}
                  </span>
                </div>
                <p className="text-[11px] text-[--text-secondary] line-clamp-2 mt-0.5">
                  {c.catalystType?.replace(/_/g, " ") ?? "catalyst"}
                  {c.judgmentV2
                    ? ` · ${c.judgmentV2.directionalImplication === "POSITIVE" ? "Positive" : c.judgmentV2.directionalImplication === "NEGATIVE" ? "Negative" : c.judgmentV2.directionalImplication === "MIXED" ? "Mixed" : "Unclear"}`
                    : ""}
                  {c.price != null ? ` · ${formatPrice(c.price)}` : ""}
                  {c.rVol != null ? ` · RVol ${c.rVol.toFixed(1)}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Action
                    label="Source"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSource(c);
                    }}
                  />
                  <Action
                    label="TV"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTradingView(c);
                    }}
                  />
                  <Action
                    label="Watch"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWatchlist(c.symbol);
                    }}
                  />
                  <Action
                    label="Mute"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMute(c.symbol);
                    }}
                  />
                  <Action
                    label="Evidence"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEvidence(c);
                    }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Action({
  label,
  onClick,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent);
        }
      }}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 cursor-pointer"
    >
      {label}
    </span>
  );
}
