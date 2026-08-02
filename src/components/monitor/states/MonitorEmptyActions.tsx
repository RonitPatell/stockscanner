"use client";

export interface MonitorEmptyActionsProps {
  onShowAll?: () => void;
  onChangePreset?: () => void;
  onOpenWatchlist?: () => void;
}

/** Shared CTAs for quiet / no-match states. */
export function MonitorEmptyActions({
  onShowAll,
  onChangePreset,
  onOpenWatchlist,
}: MonitorEmptyActionsProps) {
  return (
    <div className="tt-mon-state__actions" role="group" aria-label="Empty state actions">
      {onShowAll ? (
        <button
          type="button"
          className="tt-monitor__pill tt-mon-press"
          data-testid="monitor-empty-show-all"
          onClick={onShowAll}
        >
          Show all market activity
        </button>
      ) : null}
      {onChangePreset ? (
        <button
          type="button"
          className="tt-monitor__pill tt-mon-press"
          data-testid="monitor-empty-change-preset"
          onClick={onChangePreset}
        >
          Change preset
        </button>
      ) : null}
      {onOpenWatchlist ? (
        <button
          type="button"
          className="tt-monitor__pill tt-mon-press"
          data-testid="monitor-empty-watchlist"
          onClick={onOpenWatchlist}
        >
          Open Watchlist
        </button>
      ) : null}
    </div>
  );
}
