"use client";

import type { KeyboardEvent } from "react";
import { tradingViewUrl } from "@/lib/chart-links";
import { openSafeHttpUrl } from "@/lib/monitor/safe-open";
import { fieldNodeAccessibleName } from "./field-a11y.ts";
import type { MomentumFieldNode } from "./field-types.ts";

/**
 * List-view equivalent of the Momentum Field — same data & actions, no spatial encoding.
 */
export function MomentumFieldList({
  nodes,
  selectedSymbol,
  onSelect,
  onPinToggle,
  onWatchlistToggle,
  onMuteToggle,
  onOpenEvidence,
}: {
  nodes: MomentumFieldNode[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onPinToggle: (symbol: string) => void;
  onWatchlistToggle: (symbol: string) => void;
  onMuteToggle: (symbol: string) => void;
  onOpenEvidence: (symbol: string) => void;
}) {
  const ordered = [...nodes].sort(
    (a, b) => a.rank - b.rank || b.attentionPriority - a.attentionPriority
  );

  const onKey = (e: KeyboardEvent, node: MomentumFieldNode) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSelect(node.symbol);
    } else if (e.key === " ") {
      e.preventDefault();
      onPinToggle(node.symbol);
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      openSafeHttpUrl(node.sourceUrl);
    } else if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      window.open(tradingViewUrl(node.symbol), "_blank", "noopener,noreferrer");
    } else if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      onWatchlistToggle(node.symbol);
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      onMuteToggle(node.symbol);
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      onOpenEvidence(node.symbol);
    }
  };

  return (
    <ul
      className="tt-field-list"
      data-testid="momentum-field-list"
      aria-label="Momentum field list view"
    >
      {ordered.map((node) => {
        const name = fieldNodeAccessibleName(node);
        const rankDelta =
          node.previousRank == null ? null : node.previousRank - node.rank;
        return (
          <li key={node.symbol}>
            <button
              type="button"
              className="tt-field-list__row"
              data-selected={selectedSymbol === node.symbol ? "true" : "false"}
              data-testid={`monitor-node-${node.symbol}`}
              aria-label={name}
              onClick={() => onSelect(node.symbol)}
              onKeyDown={(e) => onKey(e, node)}
            >
              <span className="tt-field-list__rank">#{node.rank}</span>
              <strong>{node.symbol}</strong>
              {node.isLeader && <span>LEADER</span>}
              <span>{node.momentumState}</span>
              <span>
                {node.direction === "up"
                  ? "↑ UP"
                  : node.direction === "down"
                    ? "↓ DOWN"
                    : "· FLAT"}
              </span>
              {(node.risk === "high" || node.risk === "critical") && (
                <span>risk:{node.risk}</span>
              )}
              <span>
                fresh:
                {node.dataFreshnessMs == null
                  ? "?"
                  : `${Math.round(node.dataFreshnessMs / 1000)}s`}
              </span>
              {rankDelta != null && rankDelta !== 0 && (
                <span>{rankDelta > 0 ? `▲${rankDelta}` : `▼${Math.abs(rankDelta)}`}</span>
              )}
              {node.halted && <span>HALTED</span>}
              {node.dataQualityWarning && <span>data warning</span>}
              {node.pinned && <span>PIN</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
