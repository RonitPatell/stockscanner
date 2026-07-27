import type { AvailableNumber } from "../decision-card/types.ts";

export type { AvailableNumber } from "../decision-card/types.ts";

export type ReactionStage =
  | "EARLY"
  | "ACTIVE"
  | "EXTENDED"
  | "STALE"
  | "UNKNOWN";

export type MarketSessionBucket =
  | "premarket"
  | "regular"
  | "afterhours"
  | "weekend"
  | "unknown";

export type TimestampQualityLabel =
  | "EXACT_PROVIDER"
  | "ESTIMATED_PROVIDER"
  | "ARTICLE_UPDATED_TIME"
  | "MISSING"
  | "INVALID"
  | "UNAVAILABLE";

export interface ReactionStageRuleContribution {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
  /** Which configured profile/bucket applied */
  profileId?: string;
}

export interface ConflictingEvidence {
  id: string;
  label: string;
  detail: string;
}

export interface MarketDataMark {
  /** Substituted candle or delayed quote */
  substituted: boolean;
  delayed: boolean;
  note: string | null;
}

export interface ReactionMetrics {
  providerPublishedAt: string | null;
  firstSeenAt: string | null;
  classifiedAt: string | null;
  userDeliveredAt: string | null;

  priceImmediatelyBeforePublication: AvailableNumber;
  priceAtPublication: AvailableNumber;
  priceAtIngestion: AvailableNumber;
  currentPrice: AvailableNumber;

  pctMoveBeforePublication: AvailableNumber;
  pctMoveSincePublication: AvailableNumber;
  pctMoveSinceIngestion: AvailableNumber;

  distanceFromVwapPct: AvailableNumber;
  distanceFromHodPct: AvailableNumber;
  distanceFromPremarketHighPct: AvailableNumber;

  realizedVol1mPct: AvailableNumber;
  realizedVol5mPct: AvailableNumber;
  volumeAcceleration: AvailableNumber;
  relativeVolume: AvailableNumber;
  spreadExpansionBps: AvailableNumber;
  quoteFreshnessSec: AvailableNumber;
  haltCount: AvailableNumber;
  previousDisclosureSimilarity: AvailableNumber;
  sourceTimestampQuality: TimestampQualityLabel;

  atr14Pct: AvailableNumber;
  marketSession: MarketSessionBucket;
  ageSec: number | null;

  marks: {
    priceBeforePublication: MarketDataMark;
    priceAtPublication: MarketDataMark;
    priceAtIngestion: MarketDataMark;
    currentPrice: MarketDataMark;
  };
}

export interface TimelineEvent {
  id: string;
  kind:
    | "publication"
    | "first_ingestion"
    | "classified"
    | "initial_reaction"
    | "alert"
    | "halt"
    | "stage_change"
    | "user_delivered";
  at: string;
  label: string;
  detail?: string;
  meta?: Record<string, string | number | boolean | null>;
}

export interface ReactionStageResult {
  engineVersion: string;
  stage: ReactionStage;
  previousStage: ReactionStage | null;
  flappedSuppressed: boolean;
  metrics: ReactionMetrics;
  rules: ReactionStageRuleContribution[];
  explanation: string;
  conflictingEvidence: ConflictingEvidence[];
  timeline: TimelineEvent[];
  profileId: string;
  computedAt: string;
}

export interface ReactionStageTapeInput {
  currentPrice?: number | null;
  dayChangePercent?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  rVol?: number | null;
  dayHigh?: number | null;
  vwap?: number | null;
  premarketHigh?: number | null;
  bid?: number | null;
  ask?: number | null;
  spreadBps?: number | null;
  typicalSpreadBps?: number | null;
  quoteAgeSec?: number | null;
  volAccel?: number | null;
  realizedVol1mPct?: number | null;
  realizedVol5mPct?: number | null;
  atr14Pct?: number | null;
  haltCount?: number | null;
  /** 1m bars for RV / price-at-time (caller supplies; never invented) */
  bars1m?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
  haltWindows?: Array<[number, number]>;
}

export interface ReactionStageCatalystInput {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  source: string;
  category?: string | null;
  floatShares?: number | null;
  dollarVolume?: number | null;
  providerPublishedAt?: string | null;
  firstSeenAt?: string | null;
  classifiedAt?: string | null;
  userDeliveredAt?: string | null;
  ingestedAt?: string | null;
  timestampQuality?: TimestampQualityLabel | null;
  judgmentTiming?: string | null;
  /** Prior engine stage for hysteresis */
  previousStage?: ReactionStage | null;
  /** Last stage change ms */
  previousStageAtMs?: number | null;
  /** Enrichment prices — only when explicitly observed */
  priceAtPublication?: number | null;
  priceAtPublicationQuality?: "ok" | "substituted" | "delayed" | "unavailable";
  priceAtPublicationNote?: string | null;
  priceBeforePublication?: number | null;
  priceBeforePublicationQuality?: "ok" | "substituted" | "delayed" | "unavailable";
  priceBeforePublicationNote?: string | null;
  priceAtIngestion?: number | null;
  priceAtIngestionQuality?: "ok" | "substituted" | "delayed" | "unavailable";
  priceAtIngestionNote?: string | null;
  /** 0–1 similarity to prior disclosure when known */
  previousDisclosureSimilarity?: number | null;
  alertEvents?: Array<{ at: string; label: string; detail?: string }>;
  nowMs?: number;
  tape?: ReactionStageTapeInput | null;
}
