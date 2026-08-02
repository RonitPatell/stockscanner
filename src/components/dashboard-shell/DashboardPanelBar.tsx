"use client";

import { cn } from "@/lib/utils";
import {
  DESK_PRIMARY_MODE_IDS,
  DESK_MODE_META,
  type DeskModeId,
} from "@/lib/dashboard-shell/panel-prefs";

/**
 * Primary desk views only — Floor (default) + Watchlist.
 * News/Scanner are not listed; Floor already has the live tape.
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
  const active: DeskModeId =
    mode === "watchlist" ? "watchlist" : mode === "scanner" ? "scanner" : "floor";

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
          const on = active === id;
          const meta = DESK_MODE_META[id];
          return (
            <button
              key={id}
              type="button"
              data-panel={id}
              data-active={on ? "true" : "false"}
              data-testid={`panel-toggle-${id}`}
              title={meta.description}
              aria-pressed={on}
              onClick={() => onSelect(id)}
              className={cn(
                "px-2.5 sm:px-3 py-1 rounded text-[12px] sm:text-[13px] font-medium border transition-colors whitespace-nowrap",
                on
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
              )}
            >
              {meta.label}
            </button>
          );
        })}
        {active === "scanner" ? (
          <span
            className="ml-2 text-[11px] text-zinc-500"
            data-testid="desk-advanced-scanner-hint"
          >
            Advanced Scanner (deep link) ·{" "}
            <button
              type="button"
              className="text-emerald-400/90 hover:underline"
              onClick={() => onSelect("floor")}
            >
              Back to Floor
            </button>
          </span>
        ) : null}
      </div>
    </nav>
  );
}
