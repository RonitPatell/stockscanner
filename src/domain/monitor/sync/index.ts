export {
  MONITOR_SYNC_STATES,
  MONITOR_SYNC_VERSION,
  DEFAULT_SYNC_BACKOFF,
  DEFAULT_STALE_AFTER_MS,
  HIDDEN_RECONNECT_MIN_MS,
  LONG_BACKGROUND_RESYNC_MS,
  type MonitorSyncState,
  type SyncResumeMode,
  type SyncGapReason,
  type SyncResumePlan,
  type MonitorSyncAck,
  type MonitorSyncDiagnostics,
  type SyncBackoffConfig,
} from "./types.ts";
export { planSyncResume, detectLiveGap, resumeModeLabel } from "./gap.ts";
export {
  shouldApplyEntityVersion,
  dedupeByEventId,
  orderDedupeAndFilterStaleEntities,
  type VersionedEntity,
} from "./entity-version.ts";
export {
  nextReconnectDelayMs,
  reconnectDelayForVisibility,
} from "./backoff.ts";
export {
  transitionSyncState,
  syncKeepsSnapshotVisible,
  syncStatusLabel,
  syncShouldFreezeMotion,
  syncToConnectionChrome,
  type SyncMachineEvent,
} from "./machine.ts";
export { buildMonitorSyncAck, assertAckHasNoPrivateFields } from "./ack.ts";
export { isSyncDataStale, effectiveLiveLabel } from "./stale.ts";
