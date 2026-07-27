/**
 * Decision Card V3 — trader-facing catalyst decision surface.
 * Never shows probability of profit or buy/sell instructions.
 */

export const DECISION_CARD_V3_VERSION = "decision-card-v3.0";

export type CardDensity = "compact" | "standard" | "detailed";

export type MarketSessionLabel =
  | "premarket"
  | "regular"
  | "afterhours"
  | "weekend"
  | "unknown";

export type LiquidityClass =
  | "LIQUID"
  | "ACCEPTABLE"
  | "THIN"
  | "EXTREMELY_THIN"
  | "UNKNOWN"
  | "UNAVAILABLE";

export type FloatConfidence = "high" | "medium" | "low" | "unavailable";

export type ReactionStage = "EARLY" | "ACTIVE" | "EXTENDED" | "STALE" | "UNKNOWN";

export type SourceClass = "primary" | "secondary" | "unknown";

export type TimestampQualityLabel =
  | "EXACT_PROVIDER"
  | "ESTIMATED_PROVIDER"
  | "ARTICLE_UPDATED_TIME"
  | "MISSING"
  | "INVALID"
  | "UNAVAILABLE";

/** Explicit unavailable — never silently substitute. */
export type MaybeNumber = number | null;
export type FieldAvailability = "ok" | "unavailable" | "estimated" | "stale";

export interface AvailableNumber {
  value: number | null;
  availability: FieldAvailability;
  note?: string;
}

export interface ReactionStageRule {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ReactionStageResult {
  stage: ReactionStage;
  rules: ReactionStageRule[];
  explanation: string;
  conflictingEvidence?: { id: string; label: string; detail: string }[];
  engineVersion?: string;
  timeline?: {
    id: string;
    kind: string;
    at: string;
    label: string;
    detail?: string;
  }[];
  flappedSuppressed?: boolean;
}

export interface DecisionRiskFlag {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  active: boolean;
  detail: string;
  evidenceUrl?: string | null;
}

export interface DecisionCardV3Model {
  version: typeof DECISION_CARD_V3_VERSION | string;
  catalystId: string;
  builtAt: string;

  identity: {
    symbol: string;
    companyName: string | null;
    exchange: string | null;
    marketSession: MarketSessionLabel;
    price: AvailableNumber;
    changePercent: AvailableNumber;
    halted: boolean;
    haltStatusLabel: string | null;
  };

  catalyst: {
    factSummary: string;
    category: string;
    subtype: string | null;
    sourceClass: SourceClass;
    sourceName: string;
    sourceUrl: string | null;
    providerPublishedAt: string | null;
    firstSeenAt: string | null;
    ageSec: number | null;
    timestampQuality: TimestampQualityLabel;
    classificationConfidence: AvailableNumber;
    confirmingSourceCount: AvailableNumber;
  };

  reaction: {
    priceAtPublication: AvailableNumber;
    priceAtIngest: AvailableNumber;
    currentPrice: AvailableNumber;
    moveBeforePublicationPct: AvailableNumber;
    moveSincePublicationPct: AvailableNumber;
    moveSinceIngestPct: AvailableNumber;
    relativeVolume: AvailableNumber;
    volAccel1m: AvailableNumber;
    volAccel5m: AvailableNumber;
    distanceFromVwapPct: AvailableNumber;
    distanceFromPremarketHighPct: AvailableNumber;
    distanceFromSessionHighPct: AvailableNumber;
  };

  tradeability: {
    spreadDollars: AvailableNumber;
    spreadBps: AvailableNumber;
    dollarVolume: AvailableNumber;
    bidSize: AvailableNumber;
    askSize: AvailableNumber;
    floatShares: AvailableNumber;
    floatConfidence: FloatConfidence;
    liquidity: LiquidityClass;
    quoteFreshnessSec: AvailableNumber;
    sessionHaltCount: AvailableNumber;
    /** Tradeability Engine v1 explanation */
    tradeabilityExplanation?: string | null;
    tradeabilityWarnings?: string[];
    missingTradeabilityInputs?: string[];
    illustrativeSlippageNote?: string | null;
  };

  risks: DecisionRiskFlag[];
  reactionStage: ReactionStageResult;

  /** Official halt monitor strip when available */
  haltMonitor?: {
    active: boolean;
    haltCode: string;
    haltCodeTitle: string;
    lifecycle: string;
    resumptionQuoteLabel: string;
    resumptionTradeLabel: string;
    sessionHaltCount: number | null;
    newsDisseminationStatus: string;
    reconciliationStatus: string;
    catalystCount: number;
    disclaimer: string;
  } | null;

  /** Hotkey targets */
  actions: {
    sourceUrl: string | null;
    tradingViewUrl: string;
  };

  disclaimer: string;
}

export const DECISION_CARD_DISCLAIMER =
  "Informational classification only — not investment advice. No buy/sell instruction or profit probability.";
