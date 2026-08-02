import {
  MON_DURATION_INSTANT_MS,
  MON_DURATION_LAYOUT_MS,
} from "../motion/motion-tokens.ts";

export type FieldRing = "centre" | "inner" | "middle" | "outer" | "halt";

export type FieldRiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type FieldDirection = "up" | "down" | "neutral";

/** Render-ready node — market math computed off-thread / upstream. */
export interface MomentumFieldNode {
  symbol: string;
  rank: number;
  /** Previous rank for change indicator; null if new. */
  previousRank: number | null;
  attentionPriority: number;
  /** Momentum lifecycle state label (e.g. BREAKING). */
  momentumState: string;
  direction: FieldDirection;
  /** Acceleration proxy 0–1 for pulse (already capped upstream). */
  accelerationNorm: number;
  risk: FieldRiskLevel;
  /** Primary / confirmed catalyst. */
  verifiedCatalyst: boolean;
  sourceUrl: string | null;
  dataFreshnessMs: number | null;
  dataQualityWarning: boolean;
  halted: boolean;
  onWatchlist: boolean;
  muted: boolean;
  pinned: boolean;
  /** True when this is the current attention leader. */
  isLeader: boolean;
}

export interface FieldLayoutPoint {
  symbol: string;
  ring: FieldRing;
  /** Target position in viewBox coords (0–1000). */
  x: number;
  y: number;
  /** Node radius in viewBox units. */
  r: number;
  slotIndex: number;
}

export interface FieldLayoutResult {
  points: FieldLayoutPoint[];
  haltSymbols: string[];
  leaderSymbol: string | null;
  viewBox: { w: number; h: number };
}

export const FIELD_MAX_NODES = 12;
export const FIELD_VIEWBOX = { w: 1000, h: 720 } as const;
/** Visual batch cadence (ms) — instant band; not every market tick. */
export const FIELD_FRAME_MS = MON_DURATION_INSTANT_MS;
/** Leader / rank-move lerp — layout band (smooth spatial, no bounce). */
export const FIELD_LERP_MS = MON_DURATION_LAYOUT_MS;
/** Ignore sub-material layout jitter (viewBox units). */
export const FIELD_MATERIAL_DIST = 14;
/** Ignore tiny radius tweaks from priority noise. */
export const FIELD_MATERIAL_R = 3;
/** Brief leader-change marker lifetime (ms). */
export const FIELD_LEADER_MARKER_MS = MON_DURATION_LAYOUT_MS;
/** One-shot acceleration pulse duration (ms). */
export const FIELD_PULSE_ONCE_MS = 720;
/** Readable node radius floor / ceiling (viewBox units). */
export const FIELD_NODE_R_MIN = 22;
export const FIELD_NODE_R_MAX = 38;
/** Max continuous pulse Hz (legacy cap; field uses one-shot pulse). */
export const FIELD_PULSE_MAX_HZ = 1.2;
