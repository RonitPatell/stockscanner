import type { SessionSegment } from "../market-state/session.ts";
import type { MomentumConfidence } from "../momentum/types.ts";

export type AttentionVariant = "global" | "user";

export type PriorityTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type DataConfidence = MomentumConfidence;

export type ReactionStage =
  | "pre"
  | "initial"
  | "developing"
  | "extended"
  | "exhausted"
  | "unknown";

export type HaltLifecycleHint =
  | "halted"
  | "news_disseminated"
  | "resumption_quote_scheduled"
  | "resumed"
  | "none";

export type AttentionReasonCode =
  | "momentum_intensity"
  | "catalyst_materiality"
  | "catalyst_freshness"
  | "halt_urgency"
  | "resumption_urgency"
  | "dilution_urgency"
  | "regulatory_urgency"
  | "watchlist_match"
  | "alert_strategy_match"
  | "reaction_stage"
  | "data_confidence"
  | "market_session"
  | "rank_history"
  | "stale_penalty"
  | "low_confidence_penalty";

export interface AttentionReason {
  code: AttentionReasonCode;
  /** Points contributed (positive) or subtracted (negative). */
  contribution: number;
  detail: string;
}

/**
 * Normalized inputs for one symbol — already derived upstream.
 * Attention decides inspection order only; never trade entry.
 */
export interface AttentionCandidateInput {
  symbol: string;
  /** From Momentum Engine — activity intensity, not attractiveness. */
  momentumIntensity: number | null;
  momentumConfidence?: DataConfidence | null;
  /** Verified catalyst materiality 0–100; null if none. */
  catalystMateriality: number | null;
  catalystAgeMs: number | null;
  catalystVerified: boolean;
  /** Halt urgency 0–100. */
  haltUrgency: number | null;
  haltLifecycle?: HaltLifecycleHint | null;
  /** Dilution / offering urgency 0–100. */
  dilutionUrgency: number | null;
  /** Regulatory-event urgency 0–100. */
  regulatoryUrgency: number | null;
  /** User-scoped — ignored for global variant. */
  onWatchlist: boolean;
  alertStrategyMatch: boolean;
  /** Optional 0–1 strength when strategy matched. */
  alertStrategyStrength?: number | null;
  reactionStage: ReactionStage;
  dataConfidence: DataConfidence;
  sourceDataAgeMs: number | null;
  session: SessionSegment;
  /**
   * Recent 1-based ranks for this symbol (oldest→newest), when known.
   * Used for rank-stability / rising-challenger context — not P&L.
   */
  recentRanks?: number[] | null;
}

export interface AttentionScore {
  symbol: string;
  variant: AttentionVariant;
  /** Opaque user scope for user variant; null for global. */
  userScopeId: string | null;
  attentionPriority: number;
  priorityTier: PriorityTier;
  reasons: AttentionReason[];
  calcVersion: string;
  calculatedAt: string;
  /** True when score is usable for leadership without forcing a warning. */
  eligibleForLeader: boolean;
  warnings: string[];
  /** Critical halt/risk path may bypass leader hysteresis. */
  criticalBypass: boolean;
  session: SessionSegment;
}

export interface RankedCandidate {
  rank: number;
  score: AttentionScore;
  /** Delta vs previous rank snapshot (negative = improved / moved up). */
  rankDelta: number | null;
}

export interface RankSnapshot {
  variant: AttentionVariant;
  userScopeId: string | null;
  asOfMs: number;
  calcVersion: string;
  top: RankedCandidate[];
}

export interface LeaderState {
  variant: AttentionVariant;
  userScopeId: string | null;
  symbol: string | null;
  score: number | null;
  sinceMs: number | null;
  /** Challenger waiting to clear margin+duration. */
  challengerSymbol: string | null;
  challengerScore: number | null;
  challengerSinceMs: number | null;
  pinned: boolean;
  pinnedSymbol: string | null;
  warnings: string[];
  calcVersion: string;
}

export interface LeaderTransition {
  previousSymbol: string | null;
  newSymbol: string;
  reason: string;
  previousScore: number | null;
  newScore: number;
  timestamp: string;
  timestampMs: number;
  calcVersion: string;
  variant: AttentionVariant;
  userScopeId: string | null;
  bypass: boolean;
  pinned: boolean;
}

export interface LeaderSelectionConfig {
  /** Challenger must beat leader by this many priority points. */
  challengeMargin: number;
  /** Margin must hold for this duration (ms). */
  challengeHoldMs: number;
  /** Minimum time current leader is held before any non-bypass change. */
  minLeaderHoldMs: number;
  /** Source age above which leader eligibility requires a warning. */
  staleLeaderMs: number;
  /** Soft stale for scoring penalty. */
  staleScoreMs: number;
}

export interface AttentionEngineOptions {
  leader?: Partial<LeaderSelectionConfig>;
  topN?: number;
  rankHistoryDepth?: number;
  now?: () => number;
  /** Max stored transitions. */
  maxTransitions?: number;
}
