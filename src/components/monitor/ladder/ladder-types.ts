export type LadderDirection = "up" | "down" | "neutral";

export type LadderRisk = "none" | "low" | "medium" | "high" | "critical";

export type LadderFilter =
  | "all"
  | "watchlist"
  | "strategy"
  | "upward"
  | "downward"
  | "risk"
  | "halted";

export type LeaderHysteresisState =
  | "stable_leader"
  | "challenger_pending"
  | "margin_hold"
  | "min_hold"
  | "critical_bypass"
  | "pinned"
  | "not_leader";

/** Breakdown shown by “Explain rank” — inspection contributions only. */
export interface RankExplainBreakdown {
  momentumContribution: number;
  catalystUrgency: number;
  haltOrRiskUrgency: number;
  personalRelevance: number;
  dataQualityAdjustment: number;
  leaderHysteresis: LeaderHysteresisState;
  leaderHysteresisDetail: string;
  /** Ordered plain-language lines for the panel. */
  lines: Array<{ label: string; value: string; points: number }>;
}

export interface PriorityLadderRow {
  symbol: string;
  /** Live attention score — may update more often than display rank. */
  attentionPriority: number;
  /** Display rank after controlled reorder (1–10). */
  rank: number;
  previousRank: number | null;
  momentumIntensity: number;
  momentumState: string;
  direction: LadderDirection;
  /** One-line priority reason for scanning (not a badge stack). */
  priorityReason: string;
  /** Catalyst present / verified. */
  hasCatalyst: boolean;
  catalystVerified: boolean;
  risk: LadderRisk;
  onWatchlist: boolean;
  strategyMatch: boolean;
  dataConfidenceWarning: boolean;
  dataFreshnessMs: number | null;
  halted: boolean;
  muted: boolean;
  pinned: boolean;
  sourceUrl: string | null;
  /** Critical events may force immediate reorder. */
  criticalEvent: boolean;
  explain: RankExplainBreakdown;
}

/** Primary scan filters shown as a segmented control. */
export const LADDER_PRIMARY_FILTERS: LadderFilter[] = [
  "all",
  "watchlist",
  "strategy",
];

/** Extra filters behind the minimal “More” control. */
export const LADDER_MORE_FILTERS: LadderFilter[] = [
  "upward",
  "downward",
  "risk",
  "halted",
];

export const LADDER_TOP_N = 10;
/** Reorder cadence (ms) unless critical. */
export const LADDER_REORDER_MS = 2_500;
/** Score paint cadence (ms). */
export const LADDER_SCORE_MS = 200;