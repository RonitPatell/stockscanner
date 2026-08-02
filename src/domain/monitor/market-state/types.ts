import type { MetricField } from "./field.ts";
import type { SessionSegment } from "./session.ts";
import type { WindowKey } from "./version.ts";

export interface WindowMetrics {
  window: WindowKey;
  windowMs: number;
  lastPrice: MetricField<number>;
  priceReturn: MetricField<number>;
  priceVelocity: MetricField<number>; // $/sec
  priceAcceleration: MetricField<number>; // $/sec^2
  tradeCount: MetricField<number>;
  tradesPerSecond: MetricField<number>;
  tradeRateAcceleration: MetricField<number>;
  shareVolumeVelocity: MetricField<number>; // shares/sec
  dollarVolumeVelocity: MetricField<number>; // $/sec
  buySellImbalance: MetricField<number>; // (buy-sell)/(buy+sell) in [-1,1]
  high: MetricField<number>;
  low: MetricField<number>;
  realizedVolatility: MetricField<number>; // stdev of log returns (window)
}

export interface QuoteMetrics {
  quoteUpdateRate: MetricField<number>; // updates/sec over ~30s
  spreadDollars: MetricField<number>;
  spreadBps: MetricField<number>;
  spreadChange: MetricField<number>; // dollars vs prior quote sample
  bidSize: MetricField<number>;
  askSize: MetricField<number>;
  quoteFlags: string[];
}

export interface SessionMetrics {
  segment: SessionSegment;
  sessionDate: string;
  hod: MetricField<number>;
  lod: MetricField<number>;
  distanceFromHod: MetricField<number>; // fraction (last-hod)/hod
  distanceFromLod: MetricField<number>;
  vwap: MetricField<number>;
  distanceFromVwap: MetricField<number>;
  relativeVolume: MetricField<number>;
  turnoverVsFloat: MetricField<number>;
}

export interface SymbolMarketState {
  symbol: string;
  calcVersion: string;
  asOfMs: number;
  lastPrice: MetricField<number>;
  dataFreshnessMs: MetricField<number>;
  haltState: MetricField<{
    halted: boolean;
    reason: string | null;
    sinceMs: number | null;
  }>;
  windows: Record<WindowKey, WindowMetrics>;
  quote: QuoteMetrics;
  session: SessionMetrics;
}

export interface SymbolReference {
  /** Average daily volume (shares) — for RVol */
  avgDailyVolume?: number | null;
  /** Float shares — for turnover */
  floatShares?: number | null;
  floatConfidence?: "high" | "medium" | "low" | "unknown";
}

export interface EngineStats {
  eventsIn: number;
  eventsDropped: number;
  symbolsTracked: number;
  lagMsMax: number;
  lagMsAvg: number;
  lastFlushMs: number;
  partitions: number;
}

export interface CompactSnapshot {
  version: string;
  symbol: string;
  asOfMs: number;
  state: SymbolMarketState;
}
