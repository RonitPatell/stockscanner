import type { SessionSegment } from "../market-state/session.ts";
import type {
  ComponentWeightMap,
  SessionMomentumConfig,
} from "./types.ts";

const BASE_WEIGHTS: ComponentWeightMap = {
  priceVelocity: 0.14,
  priceAcceleration: 0.12,
  tradeRateBurst: 0.12,
  tradeRateAcceleration: 0.1,
  shareVolumeBurst: 0.1,
  dollarVolumeBurst: 0.1,
  relativeVolumeIntensity: 0.1,
  hodLodPressure: 0.06,
  vwapDisplacement: 0.06,
  quoteUpdateIntensity: 0.05,
  sustainedParticipationQuality: 0.05,
};

function cfg(
  segment: SessionSegment,
  over: Partial<SessionMomentumConfig> = {}
): SessionMomentumConfig {
  return {
    segment,
    weights: { ...BASE_WEIGHTS, ...(over.weights ?? {}) },
    zCap: over.zCap ?? 4,
    winsorMadMult: over.winsorMadMult ?? 5,
    staleMs: over.staleMs ?? 5_000,
    hardStaleMs: over.hardStaleMs ?? 30_000,
    maxComponentShare: over.maxComponentShare ?? 0.28,
    minTradesForHigh: over.minTradesForHigh ?? 12,
    minTradesForMedium: over.minTradesForMedium ?? 5,
    wideSpreadBps: over.wideSpreadBps ?? 150,
    openBurstTradeRateScale: over.openBurstTradeRateScale ?? 1,
    ...omitWeights(over),
  };
}

function omitWeights(
  over: Partial<SessionMomentumConfig>
): Partial<SessionMomentumConfig> {
  const { weights: _w, ...rest } = over;
  return rest;
}

/** Default session configs — open auction dampens trade-rate burst weights. */
export const DEFAULT_SESSION_CONFIGS: Record<
  SessionSegment,
  SessionMomentumConfig
> = {
  premarket: cfg("premarket", {
    weights: {
      ...BASE_WEIGHTS,
      tradeRateBurst: 0.1,
      relativeVolumeIntensity: 0.12,
      quoteUpdateIntensity: 0.06,
    },
    staleMs: 8_000,
    hardStaleMs: 45_000,
    minTradesForHigh: 8,
    wideSpreadBps: 250,
  }),
  open_auction: cfg("open_auction", {
    openBurstTradeRateScale: 0.55,
    weights: {
      ...BASE_WEIGHTS,
      tradeRateBurst: 0.08,
      tradeRateAcceleration: 0.07,
      sustainedParticipationQuality: 0.1,
      priceVelocity: 0.12,
    },
    staleMs: 3_000,
    hardStaleMs: 20_000,
    minTradesForHigh: 15,
  }),
  regular: cfg("regular"),
  after_hours: cfg("after_hours", {
    weights: {
      ...BASE_WEIGHTS,
      tradeRateBurst: 0.09,
      relativeVolumeIntensity: 0.12,
      quoteUpdateIntensity: 0.07,
    },
    staleMs: 10_000,
    hardStaleMs: 60_000,
    minTradesForHigh: 6,
    wideSpreadBps: 300,
  }),
  closed: cfg("closed", {
    staleMs: 60_000,
    hardStaleMs: 120_000,
    minTradesForHigh: 20,
  }),
};

export function resolveSessionConfig(
  segment: SessionSegment,
  overrides?: Partial<Record<SessionSegment, Partial<SessionMomentumConfig>>>
): SessionMomentumConfig {
  const base = DEFAULT_SESSION_CONFIGS[segment];
  const over = overrides?.[segment];
  if (!over) return base;
  return {
    ...base,
    ...over,
    weights: { ...base.weights, ...(over.weights ?? {}) },
    segment,
  };
}

/** Ensure weights sum ≈ 1 for explainable contribution shares. */
export function normalizedWeights(w: ComponentWeightMap): ComponentWeightMap {
  const keys = Object.keys(w) as (keyof ComponentWeightMap)[];
  let sum = 0;
  for (const k of keys) sum += w[k];
  if (sum <= 0) return { ...BASE_WEIGHTS };
  const out = { ...w };
  for (const k of keys) out[k] = w[k] / sum;
  return out;
}
