import type { AlertRuleChannel } from "../alert-rules.ts";

export type DeliveryBehaviour = "EARLY" | "CONFIRMED" | "RISK_ONLY";

export type StrategyPresetId =
  | "low_float_momentum"
  | "biotech_catalyst"
  | "large_cap_news"
  | "dilution_offering_risk"
  | "watchlist_risk_monitor"
  | "custom";

export type ConditionLogic = "AND" | "OR";

export type ConditionField =
  | "watchlist_membership"
  | "price"
  | "float_m"
  | "float_confidence"
  | "catalyst_category"
  | "source_tier"
  | "confirmation_count"
  | "catalyst_strength"
  | "reaction_stage"
  | "relative_volume"
  | "dollar_volume"
  | "pct_move"
  | "spread_bps"
  | "tradeability"
  | "dilution_flag"
  | "market_session"
  | "halt_status"
  | "max_catalyst_age_min"
  | "ticker_exclusion"
  | "sector"
  | "exchange";

export type ConditionOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gte"
  | "lte"
  | "between"
  | "is_true"
  | "is_false";

export interface StrategyCondition {
  id: string;
  field: ConditionField;
  op: ConditionOp;
  /** Scalar or list depending on op */
  value: string | number | boolean | string[] | [number, number] | null;
}

export interface StrategyConditionGroup {
  id: string;
  logic: ConditionLogic;
  conditions: StrategyCondition[];
  /** Nested groups (AND/OR trees) */
  groups?: StrategyConditionGroup[];
}

export interface StrategyMute {
  tickers?: string[];
  categories?: string[];
  sessions?: Array<"premarket" | "regular" | "afterhours" | "weekend">;
  /** ISO — mute until */
  until?: string | null;
}

export interface AlertStrategy {
  id: string;
  schemaVersion: string;
  /** Monotonic per strategy — bumped on every explicit save */
  version: number;
  name: string;
  enabled: boolean;
  presetId: StrategyPresetId;
  delivery: DeliveryBehaviour;
  channels: AlertRuleChannel[];
  /** Root group */
  root: StrategyConditionGroup;
  cooldownMinutes: number;
  dailyAlertCap: number | null;
  mutes?: StrategyMute | null;
  createdAt: string;
  updatedAt: string;
  /** Human note — never auto-edited */
  userNote?: string | null;
}

export interface StrategyValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ConditionEvalDetail {
  conditionId: string;
  field: ConditionField;
  op: ConditionOp;
  passed: boolean;
  actual: string;
  expected: string;
  detail: string;
}

export interface StrategyEvalResult {
  matched: boolean;
  delivery: DeliveryBehaviour;
  details: ConditionEvalDetail[];
  blockedByMute: boolean;
  muteReason: string | null;
  summary: string;
}

export interface StrategyExplainResult {
  wouldAlert: boolean;
  why: string[];
  whyNot: string[];
  details: ConditionEvalDetail[];
  delivery: DeliveryBehaviour;
}

export interface SimulationResult {
  strategyId: string;
  strategyVersion: number;
  matchedCount: number;
  sampleSize: number;
  matchRate: number | null;
  sampleCatalystIds: string[];
  limitations: string[];
  disclaimer: string;
}

/** Facts available to the evaluator — never includes phone/watchlist PII for analytics. */
export interface StrategyEvalFacts {
  symbol: string;
  onWatchlist: boolean;
  price: number | null;
  floatM: number | null;
  floatConfidence: "high" | "medium" | "low" | "unavailable" | null;
  catalystCategory: string | null;
  sourceTier: string | null;
  confirmationCount: number | null;
  catalystStrength: string | null;
  reactionStage: string | null;
  relativeVolume: number | null;
  dollarVolume: number | null;
  pctMove: number | null;
  spreadBps: number | null;
  tradeability: string | null;
  dilutionFlags: string[];
  marketSession: string | null;
  haltStatus: "halted" | "trading" | "unknown" | null;
  catalystAgeMin: number | null;
  sector: string | null;
  exchange: string | null;
  headline?: string | null;
  summary?: string | null;
  verifiedConfidence?: number | null;
}
