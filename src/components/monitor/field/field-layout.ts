import {
  FIELD_MAX_NODES,
  FIELD_NODE_R_MAX,
  FIELD_NODE_R_MIN,
  FIELD_VIEWBOX,
  type FieldLayoutPoint,
  type FieldLayoutResult,
  type FieldRing,
  type MomentumFieldNode,
} from "./field-types.ts";

/** Ring radii as fractions of min(viewBox) — visual structure only. */
export const FIELD_RING_RADIUS = {
  inner: 0.2,
  middle: 0.32,
  outer: 0.44,
} as const;

function ringFor(node: MomentumFieldNode, isLeader: boolean): FieldRing {
  if (node.halted) return "halt";
  if (isLeader) return "centre";
  const s = String(node.momentumState).toUpperCase();
  if (s === "BREAKING") return "inner";
  if (s === "ACTIVE" && node.attentionPriority >= 65) return "inner";
  if (s === "BUILDING" || s === "ACTIVE" || s === "RECLAIMING") return "middle";
  // EMERGING, COOLING, FADING, DORMANT, UNKNOWN, …
  return "outer";
}

/**
 * Attention priority → limited radius range.
 * Does not recompute priority — only maps an upstream score to pixels.
 * Floor keeps low-ranked nodes legible.
 */
function nodeRadius(priority: number, ring: FieldRing): number {
  const t = Math.max(0, Math.min(100, priority)) / 100;
  let r = FIELD_NODE_R_MIN + t * (FIELD_NODE_R_MAX - FIELD_NODE_R_MIN);
  if (ring === "centre") {
    // Dominant but not oversized vs peers
    r = Math.min(FIELD_NODE_R_MAX + 4, r + 3);
  } else if (ring === "halt") {
    r = Math.min(r, 30);
  }
  return Math.round(r * 10) / 10;
}

/** Stable angle from symbol so positions don't reshuffle randomly. */
function symbolAngle(symbol: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 33 + symbol.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 360) * (Math.PI / 180);
}

function placeOnRing(
  symbols: string[],
  cx: number,
  cy: number,
  radius: number,
  ring: FieldRing,
  priorities: Map<string, number>
): FieldLayoutPoint[] {
  if (symbols.length === 0) return [];
  // Sort for deterministic slot order, then fan around circle with stable offsets.
  const ordered = [...symbols].sort((a, b) => a.localeCompare(b));
  const n = ordered.length;
  return ordered.map((symbol, i) => {
    const base = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jitter = (symbolAngle(symbol, 7) - Math.PI) * 0.08;
    const a = base + jitter;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    return {
      symbol,
      ring,
      x,
      y,
      r: nodeRadius(priorities.get(symbol) ?? 40, ring),
      slotIndex: i,
    };
  });
}

/**
 * Pure spatial layout — max 12 nodes.
 * Centre = leader; rings by momentum state; halted in separate zone.
 * Does not run market math.
 */
export function layoutMomentumField(
  nodes: MomentumFieldNode[]
): FieldLayoutResult {
  const { w, h } = FIELD_VIEWBOX;
  const cx = w / 2;
  const cy = h / 2 + 10;

  // Cap + prefer leader/halted/high priority.
  const sorted = [...nodes].sort((a, b) => {
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    if (a.halted !== b.halted) return a.halted ? -1 : 1;
    return b.attentionPriority - a.attentionPriority || a.rank - b.rank;
  });
  const capped = sorted.slice(0, FIELD_MAX_NODES);

  const leader =
    capped.find((n) => n.isLeader) ??
    capped.find((n) => !n.halted) ??
    null;

  const priorities = new Map(
    capped.map((n) => [n.symbol, n.attentionPriority] as const)
  );

  const byRing: Record<FieldRing, string[]> = {
    centre: [],
    inner: [],
    middle: [],
    outer: [],
    halt: [],
  };

  for (const n of capped) {
    const isLeader = leader != null && n.symbol === leader.symbol && !n.halted;
    const ring = ringFor(n, isLeader);
    byRing[ring].push(n.symbol);
  }

  // Leader always alone in centre when present.
  if (leader && !leader.halted) {
    byRing.centre = [leader.symbol];
    for (const r of ["inner", "middle", "outer"] as const) {
      byRing[r] = byRing[r].filter((s) => s !== leader.symbol);
    }
  }

  const points: FieldLayoutPoint[] = [];

  if (byRing.centre[0]) {
    const sym = byRing.centre[0];
    points.push({
      symbol: sym,
      ring: "centre",
      x: cx,
      y: cy,
      r: nodeRadius(priorities.get(sym) ?? 50, "centre"),
      slotIndex: 0,
    });
  }

  const span = Math.min(w, h);
  points.push(
    ...placeOnRing(
      byRing.inner,
      cx,
      cy,
      span * FIELD_RING_RADIUS.inner,
      "inner",
      priorities
    )
  );
  points.push(
    ...placeOnRing(
      byRing.middle,
      cx,
      cy,
      span * FIELD_RING_RADIUS.middle,
      "middle",
      priorities
    )
  );
  points.push(
    ...placeOnRing(
      byRing.outer,
      cx,
      cy,
      span * FIELD_RING_RADIUS.outer,
      "outer",
      priorities
    )
  );

  // Halt zone — top-right overlay, clearly separated.
  const halt = byRing.halt;
  const haltOriginX = w - 160;
  const haltOriginY = 70;
  halt.forEach((symbol, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    points.push({
      symbol,
      ring: "halt",
      x: haltOriginX + col * 70,
      y: haltOriginY + row * 70,
      r: nodeRadius(priorities.get(symbol) ?? 40, "halt"),
      slotIndex: i,
    });
  });

  return {
    points,
    haltSymbols: halt,
    leaderSymbol: leader && !leader.halted ? leader.symbol : null,
    viewBox: { w, h },
  };
}

export function ringLabel(ring: FieldRing): string {
  switch (ring) {
    case "centre":
      return "Leader";
    case "inner":
      return "Breaking / high Active";
    case "middle":
      return "Building / Active";
    case "outer":
      return "Emerging / Cooling / Fading";
    case "halt":
      return "Halted";
    default:
      return ring;
  }
}
