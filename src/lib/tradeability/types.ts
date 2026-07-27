import type { AvailableNumber } from "../decision-card/types.ts";

export type { AvailableNumber };

/** Separate from catalyst quality / reaction stage. */
export type TradeabilityClass =
  | "LIQUID"
  | "ACCEPTABLE"
  | "THIN"
  | "EXTREMELY_THIN"
  | "UNKNOWN";

export type TradeabilityWarningFlag =
  | "WIDE_SPREAD"
  | "STALE_QUOTE"
  | "INSUFFICIENT_DEPTH"
  | "LOW_DOLLAR_VOLUME"
  | "HALT_RISK"
  | "FLOAT_UNCERTAIN"
  | "HIGH_VOLATILITY"
  | "EXTENDED_FROM_EVENT"
  | "MARKET_DATA_UNAVAILABLE";

export type FloatConfidence = "high" | "medium" | "low" | "unavailable";

export type MarketSessionLabel =
  | "premarket"
  | "regular"
  | "afterhours"
  | "weekend"
  | "unknown";

export interface IllustrativeSlippage {
  orderNotionalUsd: number;
  /** Estimated adverse bps — illustrative only */
  estimatedSlippageBps: AvailableNumber;
  /** Estimated $ cost — illustrative only */
  estimatedSlippageUsd: AvailableNumber;
  method: "spread_proxy" | "unavailable";
  disclaimer: string;
}

export interface TradeabilityMetrics {
  absoluteSpread: AvailableNumber;
  spreadBps: AvailableNumber;
  bidSize: AvailableNumber;
  askSize: AvailableNumber;
  quoteAgeSec: AvailableNumber;
  dollarVolume: AvailableNumber;
  dollarVolume1m: AvailableNumber;
  dollarVolume5m: AvailableNumber;
  relativeVolume: AvailableNumber;
  volumeAcceleration: AvailableNumber;
  floatShares: AvailableNumber;
  floatConfidence: FloatConfidence;
  turnoverPctOfFloat: AvailableNumber;
  realizedVolatilityPct: AvailableNumber;
  recentGapPct: AvailableNumber;
  haltCount: AvailableNumber;
  quoteUpdateFrequencyPerMin: AvailableNumber;
  distanceFromVwapPct: AvailableNumber;
  distanceFromHodPct: AvailableNumber;
  distanceFromPremarketHighPct: AvailableNumber;
  missingInputs: string[];
  hasLicensedDepth: boolean;
  marketSession: MarketSessionLabel;
}

export interface TradeabilityWarning {
  flag: TradeabilityWarningFlag;
  active: boolean;
  detail: string;
}

export interface TradeabilityRuleContribution {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TradeabilityResult {
  engineVersion: string;
  symbol: string;
  class: TradeabilityClass;
  previousClass: TradeabilityClass | null;
  flappedSuppressed: boolean;
  metrics: TradeabilityMetrics;
  warnings: TradeabilityWarning[];
  rules: TradeabilityRuleContribution[];
  explanation: string;
  illustrativeSlippage: IllustrativeSlippage[];
  computedAt: string;
  disclaimer: string;
}

export interface TradeabilityTapeInput {
  price?: number | null;
  bid?: number | null;
  ask?: number | null;
  bidSize?: number | null;
  askSize?: number | null;
  spreadDollars?: number | null;
  spreadBps?: number | null;
  quoteAgeSec?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  rVol?: number | null;
  dollarVolume?: number | null;
  dollarVolume1m?: number | null;
  dollarVolume5m?: number | null;
  volAccel?: number | null;
  floatShares?: number | null;
  realizedVolPct?: number | null;
  recentGapPct?: number | null;
  haltCount?: number | null;
  quoteUpdatesLastMinute?: number | null;
  vwap?: number | null;
  dayHigh?: number | null;
  premarketHigh?: number | null;
  /** Day |move| % for EXTENDED_FROM_EVENT */
  dayMoveAbsPct?: number | null;
  /** 1m bars optional for RV */
  bars1m?: Array<{ t: number; c: number; v?: number }>;
}

export interface TradeabilityInput {
  symbol: string;
  matchMethod?: string | null;
  floatSource?: "profile_heuristic" | "vendor" | "unknown" | null;
  marketSession?: MarketSessionLabel | null;
  /** User illustrative position size(s) for slippage — not real orders */
  illustrativeOrderNotionalsUsd?: number[];
  previousClass?: TradeabilityClass | null;
  previousClassAtMs?: number | null;
  nowMs?: number;
  tape?: TradeabilityTapeInput | null;
  /** Entitlement override for tests */
  hasLicensedDepth?: boolean;
}
