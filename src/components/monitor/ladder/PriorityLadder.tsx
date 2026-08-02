"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { tradingViewUrl } from "@/lib/chart-links";
import { openSafeHttpUrl } from "@/lib/monitor/safe-open";
import {
  LADDER_FILTERS,
  filterLadderRows,
} from "./ladder-filter.ts";
import {
  createOrderState,
  projectLadderDisplay,
} from "./ladder-order.ts";
import {
  LADDER_MORE_FILTERS,
  LADDER_PRIMARY_FILTERS,
  type LadderFilter,
  type PriorityLadderRow,
} from "./ladder-types.ts";
import { MonitorNoMatchState } from "../states/MonitorNoMatchState.tsx";

export interface PriorityLadderProps {
  /** Live attention-ranked rows (pre-filter). */
  liveRows: PriorityLadderRow[];
  selectedSymbol: string | null;
  filter: LadderFilter;
  onFilterChange: (f: LadderFilter) => void;
  onSelect: (symbol: string) => void;
  onPinToggle: (symbol: string) => void;
  onMuteToggle: (symbol: string) => void;
  onWatchlistToggle: (symbol: string) => void;
  /** Active strategy preset label for the ladder header. */
  activePresetLabel?: string;
  nowMs?: () => number;
  /** Universe size before ladder filter (for no-match vs quiet). */
  universeCount?: number;
  onShowAllActivity?: () => void;
  onChangePreset?: () => void;
  onOpenWatchlist?: () => void;
}

type CtxMenu = {
  symbol: string;
  x: number;
  y: number;
};

/**
 * Priority Ladder — top 10 inspection order, scan-first rows.
 * Scores update often; order reorders on a controlled cadence (critical bypass).
 */
export function PriorityLadder({
  liveRows,
  selectedSymbol,
  filter,
  onFilterChange,
  onSelect,
  onPinToggle,
  onMuteToggle,
  onWatchlistToggle,
  activePresetLabel = "No preset",
  nowMs,
  universeCount,
  onShowAllActivity,
  onChangePreset,
  onOpenWatchlist,
}: PriorityLadderProps) {
  const liveId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const focusSymRef = useRef<string | null>(null);
  const orderRef = useRef(createOrderState());
  const prevRankRef = useRef<Map<string, number>>(new Map());
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultNowMs = useRef(() => Date.now());
  const nowMsRef = useRef(nowMs ?? defaultNowMs.current);
  nowMsRef.current = nowMs ?? defaultNowMs.current;
  const [explainSymbol, setExplainSymbol] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ctx, setCtx] = useState<CtxMenu | null>(null);

  // Derive rows in render — no useEffect setState (that caused max-update-depth
  // when parent passed a fresh liveRows array each render).
  const displayRows = useMemo(() => {
    const filtered = filterLadderRows(liveRows, filter);
    const { rows, state } = projectLadderDisplay(
      filtered,
      orderRef.current,
      nowMsRef.current()
    );
    orderRef.current = state;
    const prev = prevRankRef.current;
    const nextPrev = new Map<string, number>();
    const out = rows.map((r) => {
      nextPrev.set(r.symbol, r.rank);
      return {
        ...r,
        previousRank: prev.has(r.symbol) ? prev.get(r.symbol)! : r.previousRank,
      };
    });
    prevRankRef.current = nextPrev;
    return out;
  }, [liveRows, filter]);

  const announce = "";

  useEffect(() => {
    if (!ctx && !moreOpen) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-ladder-ctx]") || t.closest("[data-ladder-more]")) {
        return;
      }
      setCtx(null);
      setMoreOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setCtx(null);
        setMoreOpen(false);
        setExplainSymbol(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctx, moreOpen]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const explainRow = displayRows.find((r) => r.symbol === explainSymbol) ?? null;
  const moreActive = LADDER_MORE_FILTERS.includes(filter);

  const onRowClick = useCallback(
    (symbol: string) => {
      // Defer select so double-click can pin without fighting selection.
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        onSelect(symbol);
        clickTimerRef.current = null;
      }, 220);
    },
    [onSelect]
  );

  const onRowDoubleClick = useCallback(
    (symbol: string) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onPinToggle(symbol);
    },
    [onPinToggle]
  );

  const onContext = useCallback((e: MouseEvent, symbol: string) => {
    e.preventDefault();
    focusSymRef.current = symbol;
    setCtx({ symbol, x: e.clientX, y: e.clientY });
  }, []);

  const onRowKey = useCallback(
    (e: KeyboardEvent, row: PriorityLadderRow) => {
      focusSymRef.current = row.symbol;
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(row.symbol);
      } else if (e.key === " ") {
        e.preventDefault();
        onPinToggle(row.symbol);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        openSafeHttpUrl(row.sourceUrl);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        window.open(tradingViewUrl(row.symbol), "_blank", "noopener,noreferrer");
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        onWatchlistToggle(row.symbol);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onMuteToggle(row.symbol);
      } else if (e.key === "x" || e.key === "X" || e.key === "?") {
        e.preventDefault();
        setExplainSymbol(row.symbol);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setExplainSymbol(null);
        setCtx(null);
        listRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = displayRows.findIndex((r) => r.symbol === row.symbol);
        const j = e.key === "ArrowDown" ? i + 1 : i - 1;
        const next = displayRows[j];
        if (next) {
          focusSymRef.current = next.symbol;
          const el = listRef.current?.querySelector(
            `[data-ladder-sym="${next.symbol}"]`
          ) as HTMLElement | null;
          el?.focus({ preventScroll: true });
        }
      }
    },
    [
      displayRows,
      onSelect,
      onPinToggle,
      onWatchlistToggle,
      onMuteToggle,
    ]
  );

  const ctxRow = ctx
    ? displayRows.find((r) => r.symbol === ctx.symbol) ?? null
    : null;

  return (
    <div className="tt-ladder" data-testid="priority-ladder">
      <header className="tt-ladder__header">
        <div className="tt-ladder__header-top">
          <span className="tt-ladder__title">Priority Ladder</span>
          <span
            className="tt-ladder__preset"
            title="Active strategy preset (set from the status bar)"
            data-testid="ladder-active-preset"
          >
            {activePresetLabel}
          </span>
        </div>

        <div
          className="tt-ladder__filters"
          role="toolbar"
          aria-label="Ladder primary filters"
          data-guide="monitor-filter-preset"
        >
          {LADDER_PRIMARY_FILTERS.map((id) => {
            const meta = LADDER_FILTERS.find((f) => f.id === id)!;
            const short =
              id === "strategy" ? "Strategy" : meta.label;
            return (
              <button
                key={id}
                type="button"
                className="tt-ladder__filter"
                data-active={filter === id ? "true" : "false"}
                data-testid={`ladder-filter-${id}`}
                aria-pressed={filter === id}
                onClick={() => onFilterChange(id)}
              >
                {short}
              </button>
            );
          })}

          <div className="tt-ladder__more" data-ladder-more>
            <button
              type="button"
              className="tt-ladder__filter"
              data-active={moreActive || moreOpen ? "true" : "false"}
              data-testid="ladder-filter-more"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title="More filters"
              onClick={() => setMoreOpen((v) => !v)}
            >
              More
            </button>
            {moreOpen ? (
              <div className="tt-ladder__more-menu" role="menu">
                {LADDER_MORE_FILTERS.map((id) => {
                  const meta = LADDER_FILTERS.find((f) => f.id === id)!;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      className="tt-ladder__more-item"
                      data-active={filter === id ? "true" : "false"}
                      data-testid={`ladder-filter-${id}`}
                      aria-checked={filter === id}
                      onClick={() => {
                        onFilterChange(id);
                        setMoreOpen(false);
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div
        ref={listRef}
        className="tt-ladder__list"
        tabIndex={-1}
        aria-label="Attention-ranked tickers"
      >
        {displayRows.length === 0 ? (
          <div className="tt-ladder__empty">
            {(universeCount ?? 0) > 0 || filter !== "all" ? (
              <MonitorNoMatchState
                onShowAll={onShowAllActivity}
                onChangePreset={onChangePreset}
                onOpenWatchlist={onOpenWatchlist}
              />
            ) : (
              <p>No tickers in the inspection set.</p>
            )}
          </div>
        ) : (
          displayRows.map((row) => {
            const delta =
              row.previousRank == null ? null : row.previousRank - row.rank;
            const name = ladderRowName(row, delta);
            const stale =
              row.dataFreshnessMs != null && row.dataFreshnessMs > 15_000;
            const critical =
              row.criticalEvent ||
              row.risk === "critical" ||
              row.risk === "high";
            const dirGlyph =
              row.direction === "up"
                ? "↑"
                : row.direction === "down"
                  ? "↓"
                  : "·";
            const matchTag = row.onWatchlist
              ? "WL"
              : row.strategyMatch
                ? "STR"
                : null;

            return (
              <div
                key={row.symbol}
                className="tt-ladder__row"
                data-selected={selectedSymbol === row.symbol ? "true" : "false"}
                data-pinned={row.pinned ? "true" : "false"}
                data-critical={critical ? "true" : "false"}
                data-stale={stale ? "true" : "false"}
                data-low-confidence={
                  row.dataConfidenceWarning ? "true" : "false"
                }
                data-halted={row.halted ? "true" : "false"}
                data-muted={row.muted ? "true" : "false"}
              >
                <button
                  type="button"
                  className="tt-ladder__main"
                  data-ladder-sym={row.symbol}
                  data-testid={`monitor-ladder-${row.symbol}`}
                  aria-label={name}
                  title={name}
                  onFocus={() => {
                    focusSymRef.current = row.symbol;
                  }}
                  onClick={() => onRowClick(row.symbol)}
                  onDoubleClick={() => onRowDoubleClick(row.symbol)}
                  onContextMenu={(e) => onContext(e, row.symbol)}
                  onKeyDown={(e) => onRowKey(e, row)}
                >
                  <span className="tt-ladder__left">
                    <span className="tt-ladder__rank" aria-hidden="true">
                      {row.rank}
                    </span>
                    <span
                      className="tt-ladder__delta"
                      data-dir={
                        delta == null || delta === 0
                          ? "flat"
                          : delta > 0
                            ? "up"
                            : "down"
                      }
                      data-animate={
                        delta != null && Math.abs(delta) >= 1 ? "true" : "false"
                      }
                      aria-hidden="true"
                    >
                      {delta == null || delta === 0
                        ? "·"
                        : delta > 0
                          ? `▲${delta}`
                          : `▼${Math.abs(delta)}`}
                    </span>
                  </span>

                  <span className="tt-ladder__mid">
                    <span className="tt-ladder__mid-top">
                      <strong className="tt-ladder__sym">{row.symbol}</strong>
                      <span className="tt-ladder__state">
                        {String(row.momentumState).toUpperCase()}
                        <span className="tt-ladder__dir" data-dir={row.direction}>
                          {" "}
                          {dirGlyph}
                        </span>
                      </span>
                    </span>
                    <span className="tt-ladder__reason">
                      {row.priorityReason || "—"}
                      {stale || row.dataConfidenceWarning ? (
                        <span className="tt-ladder__age" data-testid="ladder-stale-age">
                          {" "}
                          · last reliable{" "}
                          {row.dataFreshnessMs == null
                            ? "age unknown"
                            : row.dataFreshnessMs < 60_000
                              ? `${Math.round(row.dataFreshnessMs / 1000)}s ago`
                              : `${Math.round(row.dataFreshnessMs / 60_000)}m ago`}
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="tt-ladder__right">
                    <span
                      className="tt-ladder__intensity tt-num"
                      title="Momentum intensity"
                    >
                      {Math.round(row.momentumIntensity)}
                    </span>
                    {matchTag ? (
                      <span
                        className="tt-ladder__match"
                        title={
                          matchTag === "WL"
                            ? "On watchlist"
                            : "Strategy match"
                        }
                      >
                        {matchTag}
                      </span>
                    ) : (
                      <span className="tt-ladder__match tt-ladder__match--empty">
                        ·
                      </span>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  className="tt-ladder__pin-btn tt-mon-press"
                  data-active={row.pinned ? "true" : "false"}
                  data-pin={row.pinned ? "on" : "off"}
                  aria-label={
                    row.pinned ? `Unpin ${row.symbol}` : `Pin ${row.symbol}`
                  }
                  title="Pin (or double-click row)"
                  onClick={() => onPinToggle(row.symbol)}
                >
                  {row.pinned ? "Pinned" : "Pin"}
                </button>
              </div>
            );
          })
        )}
      </div>

      {explainRow && (
        <div
          className="tt-ladder__explain"
          role="dialog"
          aria-labelledby={`${liveId}-explain-title`}
          data-testid="ladder-explain-panel"
        >
          <div className="tt-ladder__explain-h">
            <strong id={`${liveId}-explain-title`}>
              Why ranked · {explainRow.symbol}
            </strong>
            <button
              type="button"
              className="tt-monitor__drawer-btn"
              onClick={() => setExplainSymbol(null)}
            >
              Close
            </button>
          </div>
          <ul>
            {explainRow.explain.lines.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span className="tabular-nums">
                  {line.points !== 0
                    ? `${line.points > 0 ? "+" : ""}${line.points}`
                    : "—"}
                </span>
                <span className="tt-ladder__explain-detail">{line.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ctx && ctxRow ? (
        <div
          className="tt-ladder__ctx"
          data-ladder-ctx
          role="menu"
          style={{ left: ctx.x, top: ctx.y }}
          data-testid="ladder-context-menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onPinToggle(ctxRow.symbol);
              setCtx(null);
            }}
          >
            {ctxRow.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onMuteToggle(ctxRow.symbol);
              setCtx(null);
            }}
          >
            Mute
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onWatchlistToggle(ctxRow.symbol);
              setCtx(null);
            }}
          >
            Watchlist
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!ctxRow.sourceUrl}
            onClick={() => {
              openSafeHttpUrl(ctxRow.sourceUrl);
              setCtx(null);
            }}
          >
            Source
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              window.open(
                tradingViewUrl(ctxRow.symbol),
                "_blank",
                "noopener,noreferrer"
              );
              setCtx(null);
            }}
          >
            TradingView
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid={`ladder-explain-${ctxRow.symbol}`}
            onClick={() => {
              setExplainSymbol(ctxRow.symbol);
              setCtx(null);
            }}
          >
            Why ranked
          </button>
        </div>
      ) : null}

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        id={liveId}
      >
        {announce}
      </div>
    </div>
  );
}

function ladderRowName(
  row: PriorityLadderRow,
  delta: number | null
): string {
  const parts = [
    row.symbol,
    `rank ${row.rank}`,
    delta != null && delta !== 0
      ? delta > 0
        ? `up ${delta}`
        : `down ${Math.abs(delta)}`
      : "rank unchanged",
    `momentum intensity ${Math.round(row.momentumIntensity)}`,
    `state ${row.momentumState}`,
    row.direction === "up"
      ? "upward"
      : row.direction === "down"
        ? "downward"
        : "neutral direction",
    row.priorityReason,
    row.halted ? "halted" : row.risk !== "none" ? `risk ${row.risk}` : null,
    row.onWatchlist ? "on watchlist" : null,
    row.strategyMatch ? "strategy match" : null,
    row.dataConfidenceWarning ? "data confidence warning" : null,
    row.pinned ? "pinned" : null,
    row.muted ? "muted" : null,
  ];
  return parts.filter(Boolean).join(", ");
}
