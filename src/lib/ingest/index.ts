export type {
  IngestTier,
  MarketPhase,
  SourceDefinition,
  SourceHealthStatus,
  DeadLetterItem,
  TierRunResult,
  CircuitState,
} from "./types.ts";
export { INGEST_TIERS } from "./types.ts";
export { getMarketPhase, intervalForPhase, backoffWithJitterMs } from "./schedule.ts";
export {
  acquirePartitionLock,
  releasePartitionLock,
  __resetMemoryLocksForTests,
} from "./lock.ts";
export {
  buildIdempotencyKey,
  normalizeTitle,
  canonicalUrl,
  publishWindow,
} from "./idempotency.ts";
export {
  claimIdempotency,
  filterFreshArticles,
  __resetIdempotencyForTests,
} from "./idempotency-store.ts";
export {
  getCircuitState,
  recordCircuitSuccess,
  recordCircuitFailure,
  __resetCircuitsForTests,
} from "./circuit.ts";
export { acquireProviderPermit } from "./provider-rate.ts";
export {
  SEC_USER_AGENT,
  acquireSecRequestPermit,
  waitForSecPermit,
} from "./sec-politeness.ts";
export {
  recordSourceSuccess,
  recordSourceFailure,
  getSourceHealth,
  __resetHealthForTests,
} from "./health.ts";
export {
  pushDeadLetter,
  listDeadLetters,
  removeDeadLetter,
  getDeadLetter,
  __resetDlqForTests,
} from "./dlq.ts";
export { isSourceFlagEnabled, isPriorityIngestEnabled } from "./flags.ts";
export {
  INGEST_SOURCES,
  sourcesForTier,
  getSourceById,
  fetchSourceArticles,
} from "./sources.ts";
export {
  runSourceTick,
  runTierIngest,
  retrySourceById,
  __resetLastRunForTests,
} from "./runner.ts";
export {
  beginIngestDrain,
  clearIngestDrain,
  isIngestDraining,
  __resetDrainForTests,
} from "./drain.ts";
