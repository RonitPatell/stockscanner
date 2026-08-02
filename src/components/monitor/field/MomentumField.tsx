"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { tradingViewUrl } from "@/lib/chart-links";
import { openSafeHttpUrl } from "@/lib/monitor/safe-open";
import {
  fieldNodeAccessibleName,
  fieldNodeOpacity,
  fieldNodeTooltip,
  selectPulseSymbol,
} from "./field-a11y.ts";
import { FIELD_RING_RADIUS, ringLabel } from "./field-layout.ts";
import {
  FIELD_PULSE_ONCE_MS,
  FIELD_VIEWBOX,
  type MomentumFieldNode,
} from "./field-types.ts";
import { useBatchedFieldVisuals } from "./useBatchedFieldVisuals.ts";
import { useTooltipDelay } from "../motion/useTooltipDelay.ts";
import { MomentumFieldList } from "./MomentumFieldList.tsx";

export interface MomentumFieldProps {
  nodes: MomentumFieldNode[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  onPinToggle: (symbol: string) => void;
  onWatchlistToggle: (symbol: string) => void;
  onMuteToggle: (symbol: string) => void;
  onOpenEvidence: (symbol: string) => void;
  /** Prefer list view (also exposed as toggle). */
  listView?: boolean;
  onListViewChange?: (list: boolean) => void;
  /** Stale / disconnected — snap layout, no decorative motion. */
  motionPaused?: boolean;
}

const RISK_STROKE: Record<MomentumFieldNode["risk"], string> = {
  none: "#2a3544",
  low: "#4a8fa8",
  medium: "#b8923f",
  high: "#c45a5a",
  critical: "#d45454",
};

function stateAbbrev(state: string): string {
  const s = String(state).toUpperCase();
  if (s.length <= 6) return s;
  return s.slice(0, 6);
}

/**
 * Central Momentum Field — SVG for ≤12 nodes + a11y/keyboard.
 * Positions batched via rAF; market math stays off this component.
 * Leader hysteresis is applied upstream (AttentionEngine) — field only displays it.
 */
export function MomentumField({
  nodes,
  selectedSymbol,
  onSelect,
  onPinToggle,
  onWatchlistToggle,
  onMuteToggle,
  onOpenEvidence,
  listView: listViewProp,
  onListViewChange,
  motionPaused = false,
}: MomentumFieldProps) {
  const gid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const focusRetainRef = useRef<string | null>(null);
  const lastPulseSrcRef = useRef<string | null>(null);
  const [listViewLocal, setListViewLocal] = useState(false);
  const [hoverSym, setHoverSym] = useState<string | null>(null);
  const [pulseSym, setPulseSym] = useState<string | null>(null);
  const tipSym = useTooltipDelay(hoverSym);
  const listView = listViewProp ?? listViewLocal;
  const setListView = onListViewChange ?? setListViewLocal;

  const nodeBySym = useMemo(() => {
    const m = new Map<string, MomentumFieldNode>();
    for (const n of nodes) m.set(n.symbol, n);
    return m;
  }, [nodes]);

  const {
    visuals,
    leaderSymbol,
    haltSymbols,
    reducedMotion,
    documentVisible,
    leaderMarker,
  } = useBatchedFieldVisuals(nodes, { motionPaused });

  const order = useMemo(() => visuals.map((v) => v.symbol), [visuals]);

  // One restrained pulse at a time — fires when the pulse candidate becomes newly eligible.
  useEffect(() => {
    const next = selectPulseSymbol(nodes, {
      reducedMotion,
      visible: documentVisible,
    });
    if (!next) {
      lastPulseSrcRef.current = null;
      return;
    }
    if (next === lastPulseSrcRef.current) return;
    lastPulseSrcRef.current = next;
    setPulseSym(next);
    const t = window.setTimeout(() => setPulseSym(null), FIELD_PULSE_ONCE_MS);
    return () => window.clearTimeout(t);
  }, [nodes, reducedMotion, documentVisible]);

  const focusSymbol = useCallback((symbol: string) => {
    const el = svgRef.current?.querySelector(
      `[data-field-node="${symbol}"]`
    ) as SVGElement | null;
    el?.focus({ preventScroll: true });
  }, []);

  // Keep keyboard focus on the same ticker across batched reorders.
  useEffect(() => {
    const sym = focusRetainRef.current;
    if (!sym) return;
    if (!nodeBySym.has(sym)) {
      focusRetainRef.current = null;
      return;
    }
    const active = document.activeElement;
    if (
      active instanceof Element &&
      active.closest(".tt-field__svg") &&
      active.getAttribute("data-field-node") !== sym
    ) {
      focusSymbol(sym);
    }
  }, [visuals, nodeBySym, focusSymbol]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent, symbol: string) => {
      const node = nodeBySym.get(symbol);
      if (!node) return;
      focusRetainRef.current = symbol;

      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(symbol);
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        onPinToggle(symbol);
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        openSafeHttpUrl(node.sourceUrl);
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        window.open(tradingViewUrl(symbol), "_blank", "noopener,noreferrer");
        return;
      }
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        onWatchlistToggle(symbol);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        onMuteToggle(symbol);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        onOpenEvidence(symbol);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        svgRef.current?.focus();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const i = order.indexOf(symbol);
        const next = order[(i + 1) % order.length];
        if (next) {
          focusRetainRef.current = next;
          focusSymbol(next);
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = order.indexOf(symbol);
        const prev = order[(i - 1 + order.length) % order.length];
        if (prev) {
          focusRetainRef.current = prev;
          focusSymbol(prev);
        }
      }
    },
    [
      nodeBySym,
      onSelect,
      onPinToggle,
      onWatchlistToggle,
      onMuteToggle,
      onOpenEvidence,
      order,
      focusSymbol,
    ]
  );

  const hoverNode = tipSym ? nodeBySym.get(tipSym) : null;
  const hoverVisual = tipSym
    ? visuals.find((v) => v.symbol === tipSym)
    : null;

  if (listView) {
    return (
      <div className="tt-field" data-testid="momentum-field-list-wrap">
        <FieldToolbar listView={listView} setListView={setListView} />
        <MomentumFieldList
          nodes={nodes}
          selectedSymbol={selectedSymbol}
          onSelect={onSelect}
          onPinToggle={onPinToggle}
          onWatchlistToggle={onWatchlistToggle}
          onMuteToggle={onMuteToggle}
          onOpenEvidence={onOpenEvidence}
        />
      </div>
    );
  }

  const { w, h } = FIELD_VIEWBOX;
  const cx = w / 2;
  const cy = h / 2 + 10;
  const span = Math.min(w, h);
  const tabRoot =
    selectedSymbol && order.includes(selectedSymbol)
      ? selectedSymbol
      : (leaderSymbol ?? order[0] ?? null);

  return (
    <div className="tt-field" data-testid="momentum-field">
      <FieldToolbar listView={listView} setListView={setListView} />
      <div className="tt-field__stage">
        <svg
          ref={svgRef}
          className="tt-field__svg"
          viewBox={`0 0 ${w} ${h}`}
          role="group"
          aria-label="Momentum field. Up to twelve tickers. Centre is leader. Use arrow keys to move, Enter to select, Space to pin."
          tabIndex={0}
          data-testid="momentum-field-svg"
        >
          <title>Momentum Field</title>
          <desc>
            Spatial inspection view. Node size is attention priority within a
            limited range. Direction and momentum state are labeled in text.
            Halted names appear in a separate halt zone. Leader selection uses
            upstream hysteresis — this view does not recompute priority.
          </desc>

          <defs>
            <radialGradient id={`${gid}-depth`} cx="50%" cy="48%" r="55%">
              <stop offset="0%" stopColor="#15202c" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#0c1219" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0a0d11" stopOpacity="0" />
            </radialGradient>
            <filter
              id={`${gid}-elev`}
              x="-40%"
              y="-40%"
              width="180%"
              height="180%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor="#000"
                floodOpacity="0.45"
              />
            </filter>
          </defs>

          {/* Depth cue + faint radial guides — structure without arcade rings */}
          <g aria-hidden="true" className="tt-field__guides">
            <circle
              cx={cx}
              cy={cy}
              r={span * 0.48}
              fill={`url(#${gid}-depth)`}
            />
            <circle
              cx={cx}
              cy={cy}
              r={span * FIELD_RING_RADIUS.inner}
              className="tt-field__guide-ring"
            />
            <circle
              cx={cx}
              cy={cy}
              r={span * FIELD_RING_RADIUS.middle}
              className="tt-field__guide-ring"
            />
            <circle
              cx={cx}
              cy={cy}
              r={span * FIELD_RING_RADIUS.outer}
              className="tt-field__guide-ring"
            />
            <text
              x={cx}
              y={32}
              textAnchor="middle"
              className="tt-field__ring-caption"
            >
              Leader · Inner · Middle · Outer
            </text>
          </g>

          {/* Brief leader-change marker */}
          {leaderMarker && !reducedMotion ? (
            <g
              className="tt-field__leader-marker"
              aria-live="polite"
              data-testid="momentum-field-leader-marker"
            >
              <circle
                cx={cx}
                cy={cy}
                r={span * 0.12}
                className="tt-field__leader-marker-ring"
              />
              <text
                x={cx}
                y={cy - span * 0.14}
                textAnchor="middle"
                className="tt-field__leader-marker-label"
              >
                Leader · {leaderMarker.symbol}
                {leaderMarker.previous
                  ? ` ← ${leaderMarker.previous}`
                  : ""}
              </text>
            </g>
          ) : null}

          {/* Halt zone */}
          <g aria-label="Halt zone">
            <rect
              x={w - 210}
              y={28}
              width={190}
              height={Math.max(90, 40 + haltSymbols.length * 36)}
              rx={4}
              className="tt-field__halt-zone"
            />
            <text x={w - 200} y={48} className="tt-field__halt-label">
              HALTED
            </text>
          </g>

          {visuals.map((v) => {
            const node = nodeBySym.get(v.symbol);
            if (!node) return null;
            const name = fieldNodeAccessibleName(node);
            const selected = selectedSymbol === v.symbol;
            const hovered = hoverSym === v.symbol;
            const pulsing = pulseSym === v.symbol && !node.halted;
            const opacity = fieldNodeOpacity(node);
            const showRisk = node.risk === "high" || node.risk === "critical";
            const dirGlyph =
              node.direction === "up"
                ? "↑"
                : node.direction === "down"
                  ? "↓"
                  : "·";
            const tabIndex =
              tabRoot === v.symbol || selected || node.pinned ? 0 : -1;

            return (
              <g
                key={v.symbol}
                transform={`translate(${v.x}, ${v.y})`}
                data-field-node={v.symbol}
                data-testid={`monitor-node-${v.symbol}`}
                data-ring={v.ring}
                data-leader={node.isLeader ? "true" : "false"}
                data-halted={node.halted ? "true" : "false"}
                tabIndex={tabIndex}
                role="button"
                aria-label={name}
                aria-pressed={selected}
                className="tt-field__node"
                style={{ opacity }}
                onClick={() => {
                  focusRetainRef.current = v.symbol;
                  onSelect(v.symbol);
                }}
                onKeyDown={(e) => onKeyDown(e, v.symbol)}
                onFocus={() => {
                  focusRetainRef.current = v.symbol;
                }}
                onMouseEnter={() =>
                  setHoverSym((s) => (s === v.symbol ? s : v.symbol))
                }
                onMouseLeave={() =>
                  setHoverSym((s) => (s === v.symbol ? null : s))
                }
              >
                {/* Inner group: hover raise via transform only — no layout shift */}
                <g
                  className="tt-field__node-lift"
                  data-hover={hovered ? "true" : "false"}
                  data-selected={selected ? "true" : "false"}
                  data-pinned={node.pinned ? "true" : "false"}
                  filter={
                    selected || node.pinned ? `url(#${gid}-elev)` : undefined
                  }
                >
                  {pulsing ? (
                    <circle
                      r={v.r + 8}
                      className="tt-field__pulse"
                      aria-hidden="true"
                    />
                  ) : null}
                  <circle
                    r={v.r}
                    className="tt-field__disk"
                    data-selected={selected ? "true" : "false"}
                    data-muted={node.muted ? "true" : "false"}
                    data-leader={node.isLeader ? "true" : "false"}
                    data-halted={node.halted ? "true" : "false"}
                    stroke={RISK_STROKE[node.risk]}
                    strokeWidth={
                      node.risk === "none" || node.risk === "low" ? 1.25 : 2.25
                    }
                    fill={
                      v.ring === "halt"
                        ? "#2a1a1a"
                        : selected
                          ? "#1a332c"
                          : node.isLeader
                            ? "#182430"
                            : "#141c26"
                    }
                  />

                  {/* Direction marker — small chevron, not a second glyph stack */}
                  <text
                    x={-v.r + 8}
                    y={3}
                    textAnchor="middle"
                    className="tt-field__dir-mark"
                    data-dir={node.direction}
                    aria-hidden="true"
                  >
                    {dirGlyph}
                  </text>

                  <text y={-2} textAnchor="middle" className="tt-field__sym">
                    {v.symbol}
                  </text>
                  <text y={12} textAnchor="middle" className="tt-field__state">
                    {stateAbbrev(node.momentumState)}
                  </text>

                  {showRisk ? (
                    <text
                      x={v.r - 2}
                      y={-v.r + 11}
                      textAnchor="end"
                      className="tt-field__risk"
                      aria-hidden="true"
                    >
                      R
                    </text>
                  ) : null}
                  {node.dataQualityWarning ? (
                    <text
                      x={v.r - 2}
                      y={v.r - 2}
                      textAnchor="end"
                      className="tt-field__warn"
                      aria-hidden="true"
                    >
                      !
                    </text>
                  ) : null}
                  {node.pinned ? (
                    <text
                      x={0}
                      y={-v.r - 6}
                      textAnchor="middle"
                      className="tt-field__pin"
                    >
                      PIN
                    </text>
                  ) : null}
                  {node.isLeader && !node.halted ? (
                    <text
                      x={0}
                      y={v.r + 14}
                      textAnchor="middle"
                      className="tt-field__leader-tag"
                    >
                      LEADER
                    </text>
                  ) : null}
                </g>
                <title>{name}</title>
              </g>
            );
          })}

          <text className="sr-only" id={`${gid}-legend`}>
            {(["centre", "inner", "middle", "outer", "halt"] as const)
              .map((r) => `${ringLabel(r)}`)
              .join(". ")}
          </text>
        </svg>

        {/* HTML tooltip — no SVG layout movement */}
        {hoverNode && hoverVisual ? (
          <div
            className="tt-field__tooltip"
            role="tooltip"
            data-testid="momentum-field-tooltip"
            style={{
              left: `${(hoverVisual.x / w) * 100}%`,
              top: `${(hoverVisual.y / h) * 100}%`,
            }}
          >
            {fieldNodeTooltip(hoverNode)}
          </div>
        ) : null}
      </div>
      <p className="tt-field__keys" aria-hidden="true">
        Enter select · Space pin · S source · T TradingView · W watchlist · M mute · E
        evidence · Esc field
      </p>
    </div>
  );
}

function FieldToolbar({
  listView,
  setListView,
}: {
  listView: boolean;
  setListView: (v: boolean) => void;
}) {
  return (
    <div className="tt-field__toolbar">
      <span>Momentum Field</span>
      <div className="tt-field__toolbar-actions">
        <button
          type="button"
          className="tt-monitor__drawer-btn"
          data-testid="momentum-field-view-toggle"
          aria-pressed={listView}
          onClick={() => setListView(!listView)}
        >
          {listView ? "Spatial view" : "List view"}
        </button>
      </div>
    </div>
  );
}
