import type { SessionSegment } from "../market-state/session.ts";
import type { LiquidityBucket } from "../momentum/types.ts";
import type { ReactionStage } from "../attention/types.ts";

export type MomentumLifecycleState =
  | "DORMANT"
  | "EMERGING"
  | "BUILDING"
  | "BREAKING"
  | "ACTIVE"
  | "COOLING"
  | "FADING"
  | "RECLAIMING"
  | "HALTED"
  | "UNKNOWN";

export type PriceDirection = "up" | "down" | "neutral" | "unavailable";

export type HodLodInteraction =
  | "near_hod"
  | "near_lod"
  | "mid_range"
  | "unknown";

/**
 * Observables for one incremental tick.
 * Must not include future data — only asOfMs and earlier.
 */
export interface MomentumStateInput {
  symbol: string;
  /** Event / sample time (ms). Engine rejects samples older than last asOf. */
  asOfMs: number;
  momentumIntensity: number | null;
  /**
   * Intensity change per second (signed). If null, engine estimates from
   * prior intensity at prior asOfMs (still causal).
   */
  momentumIntensitySlope: number | null;
  priceDirection: PriceDirection;
  priceAcceleration: number | null;
  /** Combined volume / trade-rate participation 0–100. */
  participationScore: number | null;
  hodLodInteraction: HodLodInteraction;
  reactionStage: ReactionStage;
  halted: boolean;
  /** True only when post-halt tape/quotes are reliable enough to leave UNKNOWN. */
  resumptionDataReliable?: boolean;
  sourceDataAgeMs: number | null;
  session: SessionSegment;
  liquidityCohort: LiquidityBucket;
}

export interface TransitionEvidence {
  code: string;
  detail: string;
  value?: number | string | boolean | null;
}

export interface MomentumStateTransition {
  symbol: string;
  from: MomentumLifecycleState | null;
  to: MomentumLifecycleState;
  atMs: number;
  atIso: string;
  calcVersion: string;
  evidence: TransitionEvidence[];
  /** Why the edge was allowed (matrix / override / dwell cleared). */
  trigger: string;
}

export interface MomentumStateSnapshot {
  symbol: string;
  state: MomentumLifecycleState;
  previousState: MomentumLifecycleState | null;
  sinceMs: number;
  asOfMs: number;
  calcVersion: string;
  explanation: string;
  evidence: TransitionEvidence[];
  session: SessionSegment;
  liquidityCohort: LiquidityBucket;
  /** Proposed raw state before hysteresis/dwell (for debugging). */
  proposedState: MomentumLifecycleState;
  dwellRemainingMs: number;
}

export interface StateThresholds {
  /** Intensity below → dormant-ish. */
  dormantMax: number;
  emergingMin: number;
  buildingMin: number;
  breakingMin: number;
  activeMin: number;
  /** Slope thresholds (intensity points / sec). */
  slopeEmerging: number;
  slopeBuilding: number;
  slopeBreaking: number;
  slopeCooling: number; // negative magnitude
  slopeFading: number;
  participationEmerging: number;
  participationBuilding: number;
  participationActive: number;
  /** Stale age → UNKNOWN. */
  staleMs: number;
  /** Hysteresis band on intensity when exiting upward/downward. */
  intensityHysteresis: number;
  dwellMs: Partial<Record<MomentumLifecycleState, number>>;
}

export type LiquidityCohort = LiquidityBucket;
