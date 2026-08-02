export { MONITOR_MARKET_DATA_VERSION } from "./version.ts";
export type * from "./types.ts";
export {
  validateMarketEvent,
  isDelayedEntitlement,
} from "./validate.ts";
export { MarketDataSequencer } from "./sequencing.ts";
export {
  reconnectDelayMs,
  ReconnectController,
} from "./backoff.ts";
export {
  conservativePlanEntitlements,
  assertSubscribeAllowed,
  applyEntitlementsToEvent,
  EntitlementError,
} from "./entitlements.ts";
export { isQuoteStale, isTradeStale } from "./stale.ts";
export {
  detectTradePriceDisagreement,
  lastTradeFromNormalized,
} from "./disagreement.ts";
export type { MarketDataProvider, MarketDataListener } from "./ports.ts";
export {
  credentialRefFromEnv,
  redactProviderSecrets,
} from "./ports.ts";
export {
  buildConnectionHealth,
  nextHealthSequence,
  __resetHealthSequenceForTests,
} from "./health.ts";
export { MarketDataIngestPipeline } from "./pipeline.ts";
