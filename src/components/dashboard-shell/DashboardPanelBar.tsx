"use client";

import { cn } from "@/lib/utils";
import {
  DESK_PRIMARY_MODE_IDS,
  DESK_MODE_META,
  isPrimaryDeskMode,
  type DeskModeId,
} from "@/lib/dashboard-shell/panel-prefs";

/**
 * Primary desk views: Portfolio | Watchtower | Research | Discover.
 * Markets / Structure remain reachable via deep links only.
 */
export function DashboardPanelBar({
  mode,
  onSelect,
  className,
}: {
  mode: DeskModeId;
  onSelect: (id: DeskModeId) => void;
  className?: string;
}) {
  const activePrimary = isPrimaryDeskMode(mode) ? mode : null;
  const deepLinkHint =
    mode === "scanner"
      ? "scanner"
      : mode === "floor" || mode === "news"
        ? "markets"
        : mode === "structure"
          ? "structure"
          : null;

  return (
    <nav
      data-guide="dashboard-secondary-nav"
      data-testid="desk-panel-bar"
      aria-label="Desk layout"
      className={cn(
        "tt-desk-nav shrink-0 border-b border-[var(--border)] bg-[var(--background)] h-10 sm:h-11",
        className
      )}
    >
      <div className="max-w-[1680px] mx-auto px-2 sm:px-4 h-full flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 shrink-0 mr-1">
          View
        </span>
        {DESK_PRIMARY_MODE_IDS.map((id) => {
          const on = activePrimary === id;
          const meta = DESK_MODE_META[id];
          const testId =
            id === "watchlist"
              ? "panel-toggle-portfolio"
              : `panel-toggle-${id}`;
          return (
            <button
              key={id}
              type="button"
              data-panel={id}
              data-active={on ? "true" : "false"}
              data-testid={testId}
              title={meta.description}
              aria-pressed={on}
              onClick={() => onSelect(id)}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded text-[12px] sm:text-[13px] font-medium border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                on
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
              )}
            >
              {meta.label}
            </button>
          );
        })}
        {deepLinkHint === "scanner" ? (
          <span
            className="ml-2 text-[11px] text-zinc-500"
            data-testid="desk-advanced-scanner-hint"
          >
            Advanced Scanner (deep link) ·{" "}
            <button
              type="button"
              className="text-emerald-400/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
              onClick={() => onSelect("watchlist")}
            >
              Back to Portfolio
            </button>
          </span>
        ) : null}
        {deepLinkHint === "markets" || deepLinkHint === "structure" ? (
          <span
            className="ml-2 text-[11px] text-zinc-500"
            data-testid="desk-legacy-mode-hint"
          >
            {deepLinkHint === "markets" ? "Markets" : "Capital Risk"} (deep link) ·{" "}
            <button
              type="button"
              className="text-emerald-400/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
              onClick={() => onSelect("watchtower")}
            >
              Back to Watchtower
            </button>
          </span>
        ) : null}
      </div>
    </nav>
  );
}
