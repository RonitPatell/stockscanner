"use client";

import {
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  filterTapeItems,
  sortTapeNewestFirst,
  type MonitorTapeItem,
  type TapeFilterPreset,
  type TapeIntelSection,
} from "../../../domain/monitor/event-tape/index.ts";

export const TAPE_FILTERS: Array<{ id: TapeFilterPreset; label: string }> = [
  { id: "all", label: "All" },
  { id: "selected", label: "Selected" },
  { id: "watchlist", label: "Watchlist" },
  { id: "risk", label: "Risk" },
  { id: "market", label: "Market" },
];

const ROW_ESTIMATE_PX = 52;
/** Below this count, render plainly — avoids WebKit virtualizer measure loops in the 130px strip. */
const VIRTUALIZE_AFTER = 48;

function formatTapeAge(atMs: number): string {
  const ms = Date.now() - atMs;
  if (ms < 1000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3600_000)}h`;
}

function severityTone(
  severity: MonitorTapeItem["severity"]
): "danger" | "warn" | "info" | "live" | undefined {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warn";
  if (severity === "medium") return "info";
  if (severity === "low" || severity === "info") return "live";
  return undefined;
}

export interface EventTapeProps {
  items: MonitorTapeItem[];
  filter: TapeFilterPreset;
  onFilterChange: (f: TapeFilterPreset) => void;
  selectedSymbol: string | null;
  watchlistSymbols: ReadonlySet<string> | string[];
  onSelectItem: (item: MonitorTapeItem) => void;
}

/**
 * Virtualized Monitor Event Tape — inspection events only.
 * Click selects ticker + relevant intelligence section.
 */
export function EventTape({
  items,
  filter,
  onFilterChange,
  selectedSymbol,
  watchlistSymbols,
  onSelectItem,
}: EventTapeProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const filtered = filterTapeItems(items, filter, {
      selectedSymbol,
      watchlist: watchlistSymbols,
    });
    return sortTapeNewestFirst(filtered);
  }, [items, filter, selectedSymbol, watchlistSymbols]);

  const useVirtual = visible.length >= VIRTUALIZE_AFTER;

  const virtualizer = useVirtualizer({
    count: useVirtual ? visible.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
  });

  const renderRow = (item: MonitorTapeItem, style?: CSSProperties) => {
    const clustered = item.clusterId && item.clusterMemberIds.length > 1;
    return (
      <button
        key={item.id}
        type="button"
        role="listitem"
        className="tt-event-tape__row tt-mon-press"
        data-severity={item.severity}
        data-type={item.type}
        data-symbol={item.symbol}
        data-selected={selectedSymbol === item.symbol ? "true" : "false"}
        style={style}
        onClick={() => onSelectItem(item)}
        title={item.explanation}
      >
        <span className="tt-event-tape__age">{formatTapeAge(item.atMs)}</span>
        <strong className="tt-event-tape__sym">{item.symbol}</strong>
        <span
          className="tt-event-tape__label"
          data-tone={severityTone(item.severity)}
        >
          {item.label}
          {clustered ? (
            <span className="tt-event-tape__cluster">
              · {item.clusterMemberIds.length}
            </span>
          ) : null}
        </span>
        <span className="tt-event-tape__meta">
          {item.severity} · {item.sourceType.replace(/_/g, " ")} ·{" "}
          {item.dataConfidence}
        </span>
        <span className="tt-event-tape__explain">{item.explanation}</span>
      </button>
    );
  };

  return (
    <div className="tt-event-tape" data-testid="monitor-event-tape">
      <div className="tt-monitor__panel-h">
        <span>Event Tape</span>
        <span className="tt-event-tape__count">{visible.length}</span>
      </div>

      <div
        className="tt-event-tape__filters"
        role="toolbar"
        aria-label="Event Tape filters"
      >
        {TAPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="tt-monitor__pill"
            data-active={filter === f.id ? "true" : "false"}
            aria-pressed={filter === f.id}
            onClick={() => onFilterChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        ref={parentRef}
        className="tt-event-tape__scroll"
        role="list"
        aria-label="Monitor event tape"
        data-virtual={useVirtual ? "true" : "false"}
      >
        {visible.length === 0 ? (
          <p className="tt-event-tape__empty">
            No events match this filter. Inspection history is retained
            server-side within the retention window.
          </p>
        ) : useVirtual ? (
          <div
            className="tt-event-tape__virtual"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const item = visible[vRow.index]!;
              return renderRow(item, {
                transform: `translateY(${vRow.start}px)`,
                height: vRow.size,
              });
            })}
          </div>
        ) : (
          <div className="tt-event-tape__plain">
            {visible.map((item) => renderRow(item))}
          </div>
        )}
      </div>

      <p className="tt-event-tape__disclaimer">
        Event labels describe tape structure for inspection. They are not trade
        instructions.
      </p>
    </div>
  );
}

export type { TapeIntelSection, MonitorTapeItem, TapeFilterPreset };
