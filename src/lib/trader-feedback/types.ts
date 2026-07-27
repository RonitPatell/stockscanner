export type DecisionAction = "watched" | "entered" | "skipped" | "ignored";

export type DecisionReason =
  | "catalyst_quality"
  | "dilution"
  | "spread"
  | "extension"
  | "halt"
  | "setup_mismatch"
  | "other";

export const DECISION_REASONS: Array<{ id: DecisionReason; label: string }> = [
  { id: "catalyst_quality", label: "Catalyst quality" },
  { id: "dilution", label: "Dilution" },
  { id: "spread", label: "Spread" },
  { id: "extension", label: "Extension" },
  { id: "halt", label: "Halt" },
  { id: "setup_mismatch", label: "Setup mismatch" },
  { id: "other", label: "Other" },
];

/** Snapshot frozen at decision time — never rewritten silently. */
export interface DecisionContextSnapshot {
  catalystAgeMin: number | null;
  reactionStage: string | null;
  tradeability: string | null;
  risksVisible: string[];
  moveCompletedBeforeEntryPct: number | null;
  priceAtDecision: number | null;
  publishedAt: string | null;
  catalystType: string | null;
  alertRuleId: string | null;
  alertStrategyId: string | null;
  alertStrategyVersion: number | null;
  followedOwnRules: boolean | null;
  missingInformation: string[];
}

export interface TraderDecisionRecord {
  id: string;
  schemaVersion: string;
  action: DecisionAction;
  reason: DecisionReason | null;
  reasonNote: string | null;
  catalystId: string | null;
  symbol: string;
  headline: string | null;
  decidedAt: string;
  /** Optional journal fields — user-entered only */
  entryPrice: number | null;
  exitPrice: number | null;
  positionSize: number | null;
  side: "long" | "short" | null;
  /** Associated TrustTicker alert */
  alertId: string | null;
  alertRuleId: string | null;
  alertStrategyId: string | null;
  context: DecisionContextSnapshot;
  /** Filled later from outcomes / user exit — never invents brokerage P&L */
  mfePctAfter: number | null;
  maePctAfter: number | null;
  /** Local-only until explicit sync */
  syncState: "local" | "pending" | "synced";
  updatedAt: string;
}

export interface TraderFeedbackBundle {
  format: "trustticker-trader-feedback";
  schemaVersion: string;
  exportedAt: string;
  records: TraderDecisionRecord[];
  disclaimer: string;
}

export interface CatalystAutopsy {
  recordId: string;
  symbol: string;
  action: DecisionAction;
  decidedAt: string;
  catalystAgeMin: number | null;
  reactionStageAtDecision: string | null;
  tradeabilityAtDecision: string | null;
  risksVisibleAtDecision: string[];
  moveCompletedBeforeEntryPct: number | null;
  mfePctAfter: number | null;
  maePctAfter: number | null;
  followedOwnAlertRules: boolean | null;
  similarPastDecisions: Array<{
    id: string;
    action: DecisionAction;
    reason: DecisionReason | null;
    decidedAt: string;
    symbol: string;
  }>;
  missingInformation: string[];
  disclaimer: string;
}

export interface MonthlyFactualSummary {
  month: string; // YYYY-MM
  alertsReviewed: number;
  decisionsRecorded: number;
  averageCatalystAgeMin: number | null;
  pctEnteredWhileExtended: number | null;
  pctSkippedForDilution: number | null;
  /** Decision-action counts grouped by catalyst type (from your records only). */
  outcomesByCatalystType: Array<{
    type: string;
    n: number;
    byAction: Record<DecisionAction, number>;
  }>;
  /** Decision-action counts grouped by reaction stage at decision time. */
  outcomesByReactionStage: Array<{
    stage: string;
    n: number;
    byAction: Record<DecisionAction, number>;
  }>;
  /**
   * Only present when derived from user-entered entry/exit/size.
   * Clearly labelled — never framed as TrustTicker profit.
   */
  userRecordedNotionalPnl: {
    label: string;
    totalPnl: number | null;
    sampleSize: number;
  } | null;
  disclaimer: string;
}
