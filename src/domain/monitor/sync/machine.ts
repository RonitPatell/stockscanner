import type { MonitorSyncState } from "./types.ts";

export type SyncMachineEvent =
  | { type: "SNAPSHOT_LOADED" }
  | { type: "CONNECT" }
  | { type: "CATCHUP_START" }
  | { type: "CATCHUP_APPLIED" }
  | { type: "LIVE" }
  | { type: "DEGRADE" }
  | { type: "DISCONNECT" }
  | { type: "RECONNECT" }
  | { type: "ONLINE" };

const TRANSITIONS: Record<
  MonitorSyncState,
  Partial<Record<SyncMachineEvent["type"], MonitorSyncState>>
> = {
  SNAPSHOT_READY: {
    CONNECT: "CONNECTING",
    DISCONNECT: "DISCONNECTED",
  },
  CONNECTING: {
    CATCHUP_START: "CATCHING_UP",
    LIVE: "LIVE",
    DEGRADE: "DEGRADED",
    DISCONNECT: "RECONNECTING",
  },
  CATCHING_UP: {
    CATCHUP_APPLIED: "LIVE",
    LIVE: "LIVE",
    DEGRADE: "DEGRADED",
    DISCONNECT: "RECONNECTING",
  },
  LIVE: {
    DEGRADE: "DEGRADED",
    DISCONNECT: "RECONNECTING",
    CATCHUP_START: "CATCHING_UP",
  },
  DEGRADED: {
    LIVE: "LIVE",
    CATCHUP_START: "CATCHING_UP",
    DISCONNECT: "RECONNECTING",
  },
  RECONNECTING: {
    CONNECT: "CONNECTING",
    ONLINE: "CONNECTING",
    DISCONNECT: "DISCONNECTED",
    LIVE: "LIVE",
  },
  DISCONNECTED: {
    CONNECT: "CONNECTING",
    ONLINE: "CONNECTING",
    SNAPSHOT_LOADED: "SNAPSHOT_READY",
  },
};

export function transitionSyncState(
  state: MonitorSyncState,
  event: SyncMachineEvent
): MonitorSyncState {
  return TRANSITIONS[state][event.type] ?? state;
}

/** Snapshot remains visible for these states (never blank the scanner). */
export function syncKeepsSnapshotVisible(state: MonitorSyncState): boolean {
  return (
    state === "SNAPSHOT_READY" ||
    state === "CONNECTING" ||
    state === "CATCHING_UP" ||
    state === "LIVE" ||
    state === "DEGRADED" ||
    state === "RECONNECTING"
  );
}

/** User-facing status (not diagnostics). */
export function syncStatusLabel(state: MonitorSyncState): string {
  switch (state) {
    case "SNAPSHOT_READY":
      return "Snapshot ready";
    case "CONNECTING":
    case "CATCHING_UP":
      return "Syncing live…";
    case "LIVE":
      return "Live";
    case "DEGRADED":
      return "Degraded";
    case "RECONNECTING":
      return "Reconnecting";
    case "DISCONNECTED":
      return "Disconnected";
    default:
      return state;
  }
}

/** Freeze movement animations when not live/degraded catch-up. */
export function syncShouldFreezeMotion(state: MonitorSyncState): boolean {
  return (
    state === "DISCONNECTED" ||
    state === "RECONNECTING" ||
    state === "CONNECTING" ||
    state === "CATCHING_UP"
  );
}

/** Map sync → existing MonitorConnectionState chrome. */
export function syncToConnectionChrome(
  state: MonitorSyncState
): "live" | "loading" | "degraded" | "disconnected" | "delayed" {
  switch (state) {
    case "LIVE":
      return "live";
    case "DEGRADED":
      return "degraded";
    case "SNAPSHOT_READY":
    case "CONNECTING":
    case "CATCHING_UP":
      return "loading";
    case "RECONNECTING":
      return "disconnected";
    case "DISCONNECTED":
      return "disconnected";
    default:
      return "disconnected";
  }
}
