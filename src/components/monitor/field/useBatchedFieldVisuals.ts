"use client";

import { useEffect, useRef, useState } from "react";
import { layoutMomentumField } from "./field-layout.ts";
import {
  FIELD_FRAME_MS,
  FIELD_LEADER_MARKER_MS,
  FIELD_LERP_MS,
  FIELD_MATERIAL_DIST,
  FIELD_MATERIAL_R,
  type FieldLayoutPoint,
  type MomentumFieldNode,
} from "./field-types.ts";

export interface VisualNodePos {
  symbol: string;
  x: number;
  y: number;
  r: number;
  ring: FieldLayoutPoint["ring"];
}

export interface LeaderTransitionMarker {
  symbol: string;
  previous: string | null;
  /** performance.now() deadline */
  until: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Batches layout → visual positions on rAF at FIELD_FRAME_MS.
 * Stable keyed interpolation; pauses when document hidden.
 * Market calc stays outside — this only lerps geometry.
 * Leader identity comes from upstream `isLeader` (domain hysteresis) — not recomputed here.
 */
export function useBatchedFieldVisuals(
  nodes: MomentumFieldNode[],
  opts?: { motionPaused?: boolean }
): {
  visuals: VisualNodePos[];
  leaderSymbol: string | null;
  haltSymbols: string[];
  reducedMotion: boolean;
  documentVisible: boolean;
  leaderMarker: LeaderTransitionMarker | null;
} {
  const motionPaused = !!opts?.motionPaused;
  const [visuals, setVisuals] = useState<VisualNodePos[]>([]);
  const [leaderSymbol, setLeader] = useState<string | null>(null);
  const [haltSymbols, setHalt] = useState<string[]>([]);
  const [reducedMotion, setReduced] = useState(false);
  const [documentVisible, setVisible] = useState(true);
  const [leaderMarker, setLeaderMarker] = useState<LeaderTransitionMarker | null>(
    null
  );

  const targetRef = useRef<Map<string, FieldLayoutPoint>>(new Map());
  const currentRef = useRef<Map<string, VisualNodePos>>(new Map());
  const animStartRef = useRef<Map<string, { from: VisualNodePos; t0: number }>>(
    new Map()
  );
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef(0);
  const nodesKeyRef = useRef("");
  const prevLeaderRef = useRef<string | null | undefined>(undefined);
  const markerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Recompute layout when node identity/rank/state changes — not every tick of unrelated fields.
  useEffect(() => {
    const key = nodes
      .map(
        (n) =>
          `${n.symbol}:${n.rank}:${n.momentumState}:${n.isLeader ? 1 : 0}:${n.halted ? 1 : 0}:${Math.round(n.attentionPriority)}`
      )
      .join("|");
    if (key === nodesKeyRef.current) return;
    nodesKeyRef.current = key;

    const layout = layoutMomentumField(nodes);
    setLeader(layout.leaderSymbol);
    setHalt(layout.haltSymbols);

    // Brief leader-change marker (domain already applied hysteresis upstream).
    const prev = prevLeaderRef.current;
    if (prev === undefined) {
      prevLeaderRef.current = layout.leaderSymbol;
    } else if (
      layout.leaderSymbol &&
      layout.leaderSymbol !== prev &&
      !motionPaused &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const until = performance.now() + FIELD_LEADER_MARKER_MS;
      setLeaderMarker({
        symbol: layout.leaderSymbol,
        previous: prev,
        until,
      });
      if (markerTimerRef.current) clearTimeout(markerTimerRef.current);
      markerTimerRef.current = setTimeout(() => {
        setLeaderMarker(null);
        markerTimerRef.current = null;
      }, FIELD_LEADER_MARKER_MS);
      prevLeaderRef.current = layout.leaderSymbol;
    } else {
      prevLeaderRef.current = layout.leaderSymbol;
    }

    const next = new Map<string, FieldLayoutPoint>();
    for (const p of layout.points) next.set(p.symbol, p);
    targetRef.current = next;

    const now = performance.now();
    for (const p of layout.points) {
      const cur = currentRef.current.get(p.symbol);
      if (!cur) {
        const fresh = {
          symbol: p.symbol,
          x: p.x,
          y: p.y,
          r: p.r,
          ring: p.ring,
        };
        currentRef.current.set(p.symbol, fresh);
        animStartRef.current.delete(p.symbol);
      } else {
        const moved = dist(cur, p) >= FIELD_MATERIAL_DIST || cur.ring !== p.ring;
        const resized = Math.abs(cur.r - p.r) >= FIELD_MATERIAL_R;
        if (moved || resized) {
          animStartRef.current.set(p.symbol, {
            from: { ...cur },
            t0: now,
          });
        } else {
          // Snap tiny jitter without animating every priority tick
          currentRef.current.set(p.symbol, {
            symbol: p.symbol,
            x: p.x,
            y: p.y,
            r: p.r,
            ring: p.ring,
          });
          animStartRef.current.delete(p.symbol);
        }
      }
    }
    // Drop removed
    for (const sym of [...currentRef.current.keys()]) {
      if (!next.has(sym)) {
        currentRef.current.delete(sym);
        animStartRef.current.delete(sym);
      }
    }

    setVisuals([...currentRef.current.values()]);
  }, [nodes, motionPaused]);

  useEffect(() => {
    return () => {
      if (markerTimerRef.current) clearTimeout(markerTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const snapMotion = reducedMotion || motionPaused;

    const tick = (t: number) => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(tick);

      if (document.visibilityState !== "visible") return;
      if (t - lastFrameRef.current < FIELD_FRAME_MS) return;
      lastFrameRef.current = t;

      let dirty = false;
      const out: VisualNodePos[] = [];
      for (const [sym, target] of targetRef.current) {
        const anim = animStartRef.current.get(sym);
        let pos: VisualNodePos;
        if (!anim || snapMotion) {
          pos = {
            symbol: sym,
            x: target.x,
            y: target.y,
            r: target.r,
            ring: target.ring,
          };
          animStartRef.current.delete(sym);
        } else {
          const u = Math.min(1, (t - anim.t0) / FIELD_LERP_MS);
          // ease out cubic — inward/outward reads as attention change
          const e = 1 - (1 - u) ** 3;
          pos = {
            symbol: sym,
            x: lerp(anim.from.x, target.x, e),
            y: lerp(anim.from.y, target.y, e),
            r: lerp(anim.from.r, target.r, e),
            ring: target.ring,
          };
          if (u >= 1) animStartRef.current.delete(sym);
        }
        const prev = currentRef.current.get(sym);
        if (
          !prev ||
          Math.abs(prev.x - pos.x) > 0.05 ||
          Math.abs(prev.y - pos.y) > 0.05 ||
          Math.abs(prev.r - pos.r) > 0.05
        ) {
          dirty = true;
        }
        currentRef.current.set(sym, pos);
        out.push(pos);
      }
      if (dirty) setVisuals(out);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion, motionPaused]);

  return {
    visuals,
    leaderSymbol,
    haltSymbols,
    reducedMotion: reducedMotion || motionPaused,
    documentVisible,
    leaderMarker,
  };
}
