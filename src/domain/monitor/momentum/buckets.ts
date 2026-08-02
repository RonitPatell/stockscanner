import type { LiquidityBucket, PriceBucket } from "./types.ts";

export function priceBucket(price: number | null | undefined): PriceBucket {
  if (price == null || !Number.isFinite(price) || price <= 0) return "unknown";
  if (price < 1) return "sub_1";
  if (price < 5) return "1_5";
  if (price < 20) return "5_20";
  if (price < 100) return "20_100";
  return "100_plus";
}

/**
 * Liquidity from ADV (shares). Unknown when ADV missing.
 * Buckets are coarse priors — not tradability grades.
 */
export function liquidityBucket(
  avgDailyVolume: number | null | undefined
): LiquidityBucket {
  if (avgDailyVolume == null || !Number.isFinite(avgDailyVolume) || avgDailyVolume < 0) {
    return "unknown";
  }
  if (avgDailyVolume < 50_000) return "ultra_thin";
  if (avgDailyVolume < 250_000) return "thin";
  if (avgDailyVolume < 1_500_000) return "moderate";
  return "liquid";
}

/**
 * Expected scale priors by price×liquidity for velocity-like features.
 * Used only when symbol baseline is thin; never from outcome history.
 */
export function priorVelocityScale(
  price: PriceBucket,
  liq: LiquidityBucket
): number {
  // $/sec typical noise floor prior
  const priceScale: Record<PriceBucket, number> = {
    sub_1: 0.0005,
    "1_5": 0.002,
    "5_20": 0.005,
    "20_100": 0.02,
    "100_plus": 0.05,
    unknown: 0.01,
  };
  const liqMult: Record<LiquidityBucket, number> = {
    ultra_thin: 0.4,
    thin: 0.7,
    moderate: 1,
    liquid: 1.3,
    unknown: 1,
  };
  return priceScale[price] * liqMult[liq];
}

export function priorTradeRateScale(liq: LiquidityBucket): number {
  const base: Record<LiquidityBucket, number> = {
    ultra_thin: 0.05,
    thin: 0.2,
    moderate: 0.8,
    liquid: 3,
    unknown: 0.5,
  };
  return base[liq];
}

export function priorDollarVelScale(
  price: PriceBucket,
  liq: LiquidityBucket
): number {
  const px: Record<PriceBucket, number> = {
    sub_1: 0.5,
    "1_5": 3,
    "5_20": 15,
    "20_100": 80,
    "100_plus": 200,
    unknown: 20,
  };
  const liqMult: Record<LiquidityBucket, number> = {
    ultra_thin: 0.3,
    thin: 0.6,
    moderate: 1,
    liquid: 2,
    unknown: 1,
  };
  return px[price] * liqMult[liq];
}
