export { MONITOR_MOMENTUM_VERSION } from "./version.ts";

export {
  median,
  mad,
  robustZ,
  winsorize,
  capAbs,
  intensityFromAbsZ,
  signedIntensityFromZ,
} from "./robust.ts";

export {
  priceBucket,
  liquidityBucket,
  priorVelocityScale,
  priorTradeRateScale,
  priorDollarVelScale,
} from "./buckets.ts";

export {
  DEFAULT_SESSION_CONFIGS,
  resolveSessionConfig,
  normalizedWeights,
} from "./config.ts";

export { extractFeatures } from "./features.ts";
export {
  SymbolBaseline,
  MarketActivityBaseline,
  sampleFromFeatures,
} from "./baseline.ts";
export type { BaselineField, BaselineSample } from "./baseline.ts";

export { scoreMomentum } from "./score.ts";
export { MomentumEngine, scoreFromMarketState } from "./engine.ts";

export {
  MemoryMomentumSnapshotStore,
} from "./snapshot-store.ts";
export type { MomentumSnapshotStore } from "./snapshot-store.ts";

export type {
  MomentumConfidence,
  MomentumDirection,
  PriceBucket,
  LiquidityBucket,
  ComponentId,
  ComponentContribution,
  DataQualityPenalty,
  MomentumResult,
  MomentumSnapshot,
  MomentumRawFeatures,
  ComponentWeightMap,
  SessionMomentumConfig,
  MomentumEngineOptions,
} from "./types.ts";
