export { MONITOR_EVENT_TAPE_VERSION } from "./version.ts";
export {
  EVENT_TAPE_CONFIG,
  RISK_TAPE_TYPES,
  MARKET_TAPE_TYPES,
  DEFAULT_SEVERITY,
  HYSTERESIS_PAIRS,
} from "./config.ts";
export {
  TAPE_EVENT_CATALOG,
  composeExplanation,
  catalogLooksLikeTradeAdvice,
} from "./catalog.ts";
export {
  normalizeTapeSignal,
  fingerprintFor,
  isMonitorTapeEventType,
} from "./normalize.ts";
export {
  createDedupeState,
  decideDedupe,
  rememberAccepted,
  pruneDedupeState,
} from "./dedupe.ts";
export { assignCluster, createClusterState, syncClusterMembers } from "./cluster.ts";
export { filterTapeItems, sortTapeNewestFirst } from "./filter.ts";
export { MemoryEventTapeStore } from "./memory-store.ts";
export { EventTapeEngine } from "./engine.ts";
export type { EventTapeEngineOptions } from "./engine.ts";
export type {
  MonitorTapeEventType,
  MonitorTapeItem,
  RawTapeSignal,
  TapeSeverity,
  TapeSourceType,
  TapeDataConfidence,
  TapeIntelSection,
  TapeFilterPreset,
  TapeIngestResult,
  EventTapeStorePort,
} from "./types.ts";
export { MONITOR_TAPE_EVENT_TYPES } from "./types.ts";
