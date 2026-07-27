import type { MarketSessionLabel } from "../calibration/types.ts";
import { ANALOGUE_ENGINE_VERSION } from "./version.ts";

export type AnalogueImplication =
  | "POSITIVE"
  | "NEGATIVE"
  | "MIXED"
  | "UNCLEAR";

export type DilutionStatus = "dilution_risk" | "clean" | "unknown";

export type PriceBucket = "sub1" | "low" | "mid" | "high" | "unknown";
export type RvolBucket = "quiet" | "normal" | "elevated" | "extreme" | "unknown";
export type GapBucket = "flat" | "small" | "medium" | "large" | "unknown";
export type ReactionStageBucket =
  | "EARLY"
  | "ACTIVE"
  | "EXTENDED"
  | "STALE"
  | "UNKNOWN";

/** Tightness for each matching dimension */
export type MatchStrictness = "exact" | "adjacent" | "any";

export interface AnalogueMatchCriteria {
  category: MatchStrictness;
  subtype: MatchStrictness;
  implication: MatchStrictness;
  sourceTier: MatchStrictness;
  marketSession: MatchStrictness;
  priceBucket: MatchStrictness;
  floatBucket: MatchStrictness;
  liquidityBucket: MatchStrictness;
  rvolBucket: MatchStrictness;
  gapBucket: MatchStrictness;
  reactionStage: MatchStrictness;
  sector: MatchStrictness;
  dilutionStatus: MatchStrictness;
  marketRegime: MatchStrictness;
}

export const DEFAULT_CRITERIA: AnalogueMatchCriteria = {
  category: "exact",
  subtype: "adjacent",
  implication: "exact",
  sourceTier: "adjacent",
  marketSession: "exact",
  priceBucket: "adjacent",
  floatBucket: "adjacent",
  liquidityBucket: "adjacent",
  rvolBucket: "adjacent",
  gapBucket: "adjacent",
  reactionStage: "any",
  sector: "any",
  dilutionStatus: "exact",
  marketRegime: "any",
};

export const LOOSE_CRITERIA: AnalogueMatchCriteria = {
  category: "exact",
  subtype: "any",
  implication: "adjacent",
  sourceTier: "any",
  marketSession: "adjacent",
  priceBucket: "any",
  floatBucket: "adjacent",
  liquidityBucket: "any",
  rvolBucket: "any",
  gapBucket: "any",
  reactionStage: "any",
  sector: "any",
  dilutionStatus: "adjacent",
  marketRegime: "any",
};

export const TIGHT_CRITERIA: AnalogueMatchCriteria = {
  category: "exact",
  subtype: "exact",
  implication: "exact",
  sourceTier: "exact",
  marketSession: "exact",
  priceBucket: "exact",
  floatBucket: "exact",
  liquidityBucket: "exact",
  rvolBucket: "exact",
  gapBucket: "exact",
  reactionStage: "exact",
  sector: "exact",
  dilutionStatus: "exact",
  marketRegime: "exact",
};

/** Feature vector frozen as-of historical event time (no future leakage). */
export interface AnalogueFeatureVector {
  catalystId: string;
  symbol: string;
  /** Ingest / first-seen clock — matching as-of boundary */
  ingestedAt: string;
  publishedAt: string;
  category: string;
  subtype: string | null;
  implication: AnalogueImplication;
  sourceTier: string | null;
  marketSession: MarketSessionLabel | string;
  priceBucket: PriceBucket;
  floatBucket: string;
  liquidityBucket: string;
  rvolBucket: RvolBucket;
  gapBucket: GapBucket;
  reactionStage: ReactionStageBucket;
  sector: string | null;
  dilutionStatus: DilutionStatus;
  /** Overall market regime when reliable; else unknown */
  marketRegime: "risk_on" | "risk_off" | "neutral" | "unknown";
  /** Classification schema used at event time */
  classificationVersion: string | null;
  entryPrice: number | null;
  delistedOrChanged: boolean;
  splitAdjusted: boolean;
  excludeReason: string | null;
}

export type AnalogueHorizonKey =
  | "m1"
  | "m3"
  | "m5"
  | "m15"
  | "m30"
  | "m60"
  | "close"
  | "next_open";

export const ANALOGUE_HORIZONS: AnalogueHorizonKey[] = [
  "m1",
  "m3",
  "m5",
  "m15",
  "m30",
  "m60",
  "close",
  "next_open",
];

export interface AnalogueEventOutcome {
  catalystId: string;
  symbol: string;
  /** Signed returns % at each horizon — null if missing/corrupt */
  returns: Partial<Record<AnalogueHorizonKey, number | null>>;
  mfePct: number | null;
  maePct: number | null;
  /** Fraction path stayed above event/entry price through primary window */
  stayedAboveEntry: boolean | null;
  /** Fell below the 5-minute mark price after m5 */
  fellBelowFiveMin: boolean | null;
  medianSpreadPct: number | null;
  liquidityDollarVol: number | null;
  halted: boolean;
  valid: boolean;
  invalidReason: string | null;
}

export interface AnalogueMatch {
  features: AnalogueFeatureVector;
  outcome: AnalogueEventOutcome;
  /** Human reasons this event was considered comparable */
  whyComparable: string[];
  /** Dimensions that matched under current criteria */
  matchedDimensions: string[];
  /** Dimensions relaxed / not required */
  relaxedDimensions: string[];
  score: number;
}

export interface HorizonDistribution {
  horizon: AnalogueHorizonKey;
  n: number;
  medianPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  /** Wilson CI on share with |return| ≥ 1% — descriptive breadth, not win-rate */
  reactionShare: number | null;
  reactionShareCiLow: number | null;
  reactionShareCiHigh: number | null;
  insufficientSample: boolean;
}

export interface AnalogueAggregateStats {
  sampleSize: number;
  insufficientSample: boolean;
  smallSampleLabel: string | null;
  horizons: HorizonDistribution[];
  medianMfePct: number | null;
  medianMaePct: number | null;
  pctRemainedAboveEventPrice: number | null;
  pctRemainedAboveEventPriceCi: { low: number; high: number } | null;
  pctFellBelowFiveMinPrice: number | null;
  pctFellBelowFiveMinPriceCi: { low: number; high: number } | null;
  medianSpreadPct: number | null;
  medianLiquidityDollarVol: number | null;
  haltFrequency: number | null;
  haltFrequencyCi: { low: number; high: number } | null;
}

export interface AnalogueReport {
  engineVersion: typeof ANALOGUE_ENGINE_VERSION | string;
  generatedAt: string;
  query: AnalogueFeatureVector;
  criteria: AnalogueMatchCriteria;
  criteriaPreset: "tight" | "default" | "loose" | "custom";
  candidatesScanned: number;
  excludedCount: number;
  matches: AnalogueMatch[];
  stats: AnalogueAggregateStats;
  /** Sample size if criteria loosened one notch (informative) */
  sampleSizeIfLooser: number | null;
  sampleSizeIfTighter: number | null;
  methodology: {
    version: string;
    summary: string;
    noLookAhead: string;
    adjustments: string;
    disclosures: readonly string[];
  };
  disclaimer: string;
}

export const ANALOGUE_DISCLAIMER =
  "Historical analogues show how similar past catalysts traded after the event. This is descriptive evidence only — not an expected profit, target price, probability of success, or personalized recommendation.";

export const MIN_ANALOGUE_SAMPLE = 10;
export const MIN_ANALOGUE_COMFORTABLE = 30;
