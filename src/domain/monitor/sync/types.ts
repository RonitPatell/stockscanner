/**
 * Gapless Monitor live-sync contract (SSR snapshot ↔ SSE).
 * Informational desk only — no trade instructions.
 */

export const MONITOR_SYNC_STATES = [
  "SNAPSHOT_READY",
  "CONNECTING",
  "CATCHING_UP",
  "LIVE",
  "DEGRADED",
  "RECONNECTING",
  "DISCONNECTED",
] as const;

export type MonitorSyncState = (typeof MONITOR_SYNC_STATES)[number];

export type SyncResumeMode = "replay" | "full_snapshot";

export type SyncGapReason =
  | "ring_truncated"
  | "sequence_hole"
  | "cursor_behind_ring"
  | "worker_restart"
  | "none";

export interface SyncResumePlan {
  mode: SyncResumeMode;
  reason: SyncGapReason;
  /** Exclusive cursor the client already has. */
  afterEventId: number;
  messages: Array<{ sequence: number; id: string }>;
  oldestInRing: number | null;
  newestInRing: number | null;
  hubSequence: number;
}

/** Public acknowledgement — never includes watchlists or strategies. */
export interface MonitorSyncAck {
  streamConnected: boolean;
  snapshotId: string | null;
  lastEventReceived: string | null;
  lastEventApplied: string | null;
  liveSyncCompleted: boolean;
  /** Hub sequence for server observability (not private). */
  sequence: number;
}

export interface MonitorSyncDiagnostics {
  syncState: MonitorSyncState;
  replayedUpdates: number;
  lastEventReceived: string | null;
  lastEventApplied: string | null;
  snapshotId: string | null;
  gapReason: SyncGapReason | null;
  reconnectAttempt: number;
  documentHidden: boolean;
}

export interface SyncBackoffConfig {
  baseMs: number;
  maxMs: number;
  /** 0–1 random jitter fraction of delay. */
  jitter: number;
}

export const DEFAULT_SYNC_BACKOFF: SyncBackoffConfig = {
  baseMs: 500,
  maxMs: 30_000,
  jitter: 0.3,
};

/** Age after which values must not be labelled live. */
export const DEFAULT_STALE_AFTER_MS = 8_000;
/** Hidden-tab reconnect pause threshold — slow reconnects while hidden. */
export const HIDDEN_RECONNECT_MIN_MS = 15_000;
/** After this background duration, force snapshot resync on resume. */
export const LONG_BACKGROUND_RESYNC_MS = 5_000;

export const MONITOR_SYNC_VERSION = "monitor-sync-v1.0";
