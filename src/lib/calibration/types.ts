/**
 * Catalyst outcome calibration — measure classification quality via price reaction.
 * Not a profit guarantee. Dollar notionals are optional / clearly labelled.
 */

export const OUTCOME_HORIZONS = [
  "ingest",
  "m1",
  "m3",
  "m5",
  "m15",
  "m30",
  "m60",
  "close",
  "next_open",
] as const;

export type OutcomeHorizon = (typeof OUTCOME_HORIZONS)[number];

/** Minutes after ingest for timed horizons (close / next_open resolved separately). */
export const HORIZON_OFFSET_MINUTES: Record<
  Exclude<OutcomeHorizon, "ingest" | "close" | "next_open">,
  number
> = {
  m1: 1,
  m3: 3,
  m5: 5,
  m15: 15,
  m30: 30,
  m60: 60,
};

/** Primary horizon used in public calibration summaries. */
export const PRIMARY_HORIZON: OutcomeHorizon = "m15";

export type PriceDataSource =
  | "quote_cache"
  | "live_quote"
  | "finnhub_1m"
  | "finnhub_daily"
  | "catalyst_row"
  | "unknown";

export type PriceTimestampQuality =
  | "EXACT"
  | "CANDLE_OPEN"
  | "CANDLE_CLOSE"
  | "SUBSTITUTED_NEXT"
  | "STALE"
  | "MISSING"
  | "INVALID"
  | "HALTED"
  | "SPLIT_ADJUST_SUSPECT"
  | "GAP_EXTREME";

export interface PriceSnapshot {
  horizon: OutcomeHorizon;
  price: number | null;
  /** ISO timestamp of the price observation (candle open or quote time) */
  observedAt: string | null;
  /** Target time we wanted (ISO) */
  targetAt: string | null;
  source: PriceDataSource;
  quality: PriceTimestampQuality;
  /** True when we used a later candle than requested — always labelled */
  substituted: boolean;
  /** Seconds after target when substituted */
  substituteLagSec: number | null;
  volume: number | null;
  /** Bid-ask spread % when available */
  spreadPct: number | null;
  note?: string;
}

export interface HorizonMetrics {
  horizon: OutcomeHorizon;
  rawReturnPct: number | null;
  spyRelativePct: number | null;
  sectorRelativePct: number | null;
  /** Max favourable excursion vs entry over [ingest, horizon] */
  mfePct: number | null;
  /** Max adverse excursion vs entry over [ingest, horizon] */
  maePct: number | null;
  volumeChangePct: number | null;
  spreadPct: number | null;
  sampleValid: boolean;
  invalidReason?: string;
}

export type MarketSessionLabel =
  | "premarket"
  | "regular"
  | "afterhours"
  | "weekend"
  | "unknown";

export type FloatBucket = "micro" | "small" | "mid" | "large" | "unknown";
export type LiquidityBucket = "thin" | "moderate" | "liquid" | "unknown";
export type ConfidenceBucket = "low" | "medium" | "high" | "unknown";

/** Minimum samples before publishing a cohort precision. */
export const MIN_SAMPLE_FOR_PRECISION = 20;
export const MIN_SAMPLE_FOR_PUBLIC = 10;

export interface CalibrationCohortStats {
  key: string;
  dimension: string;
  value: string;
  n: number;
  /** Fraction of eligible outcomes with |rawReturn| ≥ reaction threshold */
  reactionRate: number | null;
  /** Mean absolute raw return % */
  meanAbsReturnPct: number | null;
  /** Median absolute raw return % */
  medianAbsReturnPct: number | null;
  /** Mean SPY-relative return % (signed as stored) */
  meanSpyRelativePct: number | null;
  /** Directional hit rate when strength/direction available — else null */
  precision: number | null;
  /** Wilson score interval for precision or reactionRate */
  ciLow: number | null;
  ciHigh: number | null;
  /** Below min sample — do not treat as conclusive */
  insufficientSample: boolean;
  excludeUrgentCount: number;
}

export interface CalibrationReport {
  version: "calibration-v1";
  generatedAt: string;
  primaryHorizon: OutcomeHorizon;
  reactionThresholdPct: number;
  totalOutcomes: number;
  eligibleUrgent: number;
  cohorts: CalibrationCohortStats[];
  disclaimer: string;
}

export const CALIBRATION_DISCLAIMER =
  "Calibration measures how prices reacted after classified catalysts. It is not a profit guarantee, not brokerage P&L, and past reactions do not predict future results.";
