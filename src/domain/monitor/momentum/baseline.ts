import { RingBuffer } from "../market-state/ring-buffer.ts";
import { median } from "./robust.ts";
import type { MomentumRawFeatures } from "./types.ts";

/** Fields we keep in the symbol baseline ring. */
export type BaselineField =
  | "priceVelocity"
  | "priceAcceleration"
  | "tradesPerSecond"
  | "tradeRateAcceleration"
  | "shareVolumeVelocity"
  | "dollarVolumeVelocity"
  | "relativeVolume"
  | "quoteUpdateRate"
  | "absVwapDisp"
  | "absHodLod";

export type BaselineSample = Record<BaselineField, number | null> & {
  t: number;
};

export function sampleFromFeatures(f: MomentumRawFeatures): BaselineSample {
  const hod =
    f.distanceFromHod != null ? Math.abs(f.distanceFromHod) : null;
  const lod =
    f.distanceFromLod != null ? Math.abs(f.distanceFromLod) : null;
  let absHodLod: number | null = null;
  if (hod != null || lod != null) {
    absHodLod = Math.min(hod ?? Infinity, lod ?? Infinity);
    if (!Number.isFinite(absHodLod)) absHodLod = null;
  }
  return {
    t: f.asOfMs,
    priceVelocity: f.priceVelocity,
    priceAcceleration: f.priceAcceleration,
    tradesPerSecond: f.tradesPerSecond,
    tradeRateAcceleration: f.tradeRateAcceleration,
    shareVolumeVelocity: f.shareVolumeVelocity,
    dollarVolumeVelocity: f.dollarVolumeVelocity,
    relativeVolume: f.relativeVolume,
    quoteUpdateRate: f.quoteUpdateRate,
    absVwapDisp:
      f.distanceFromVwap != null ? Math.abs(f.distanceFromVwap) : null,
    absHodLod,
  };
}

export class SymbolBaseline {
  private readonly ring: RingBuffer<BaselineSample>;

  constructor(capacity = 64) {
    this.ring = new RingBuffer(capacity);
  }

  push(sample: BaselineSample): void {
    this.ring.push(sample);
  }

  size(): number {
    return this.ring.size;
  }

  /** Collect finite values for a field (excludes current if matching t). */
  series(field: BaselineField, excludeT?: number): number[] {
    const out: number[] = [];
    for (const s of this.ring.toArray()) {
      if (excludeT != null && s.t === excludeT) continue;
      const v = s[field];
      if (v != null && Number.isFinite(v)) out.push(v);
    }
    return out;
  }
}

/**
 * Market-wide activity tracker — robust median of trade-rate / dollar vel
 * across symbols observed this cadence window. Marked unreliable when
 * sample count is low.
 */
export class MarketActivityBaseline {
  private tradeRates: number[] = [];
  private dollarVels: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 2_000) {
    this.maxSamples = maxSamples;
  }

  observe(f: MomentumRawFeatures): void {
    if (f.tradesPerSecond != null && Number.isFinite(f.tradesPerSecond)) {
      this.tradeRates.push(f.tradesPerSecond);
      if (this.tradeRates.length > this.maxSamples) {
        this.tradeRates.splice(0, this.tradeRates.length - this.maxSamples);
      }
    }
    if (
      f.dollarVolumeVelocity != null &&
      Number.isFinite(f.dollarVolumeVelocity)
    ) {
      this.dollarVels.push(Math.abs(f.dollarVolumeVelocity));
      if (this.dollarVels.length > this.maxSamples) {
        this.dollarVels.splice(0, this.dollarVels.length - this.maxSamples);
      }
    }
  }

  /** Reset each snapshot cadence so market-wide reflects recent cross-section. */
  reset(): void {
    this.tradeRates = [];
    this.dollarVels = [];
  }

  snapshot(): {
    medianTradeRate: number | null;
    medianDollarVel: number | null;
    sampleCount: number;
    reliable: boolean;
  } {
    const sampleCount = Math.min(
      this.tradeRates.length,
      this.dollarVels.length || this.tradeRates.length
    );
    return {
      medianTradeRate: median(this.tradeRates),
      medianDollarVel: median(this.dollarVels),
      sampleCount: this.tradeRates.length,
      reliable: this.tradeRates.length >= 25,
    };
  }
}
