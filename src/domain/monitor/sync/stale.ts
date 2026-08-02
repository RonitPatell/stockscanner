import { DEFAULT_STALE_AFTER_MS } from "./types.ts";
import type { MonitorSyncState } from "./types.ts";

/** True when market data must not be labelled live. */
export function isSyncDataStale(
  lastEventAtMs: number | null,
  nowMs: number,
  staleAfterMs = DEFAULT_STALE_AFTER_MS
): boolean {
  if (lastEventAtMs == null) return false;
  return nowMs - lastEventAtMs > staleAfterMs;
}

/**
 * Effective label: never call old values "live" when disconnected/stale.
 */
export function effectiveLiveLabel(
  syncState: MonitorSyncState,
  lastEventAtMs: number | null,
  nowMs: number,
  staleAfterMs = DEFAULT_STALE_AFTER_MS
): "live" | "stale" | "syncing" | "disconnected" {
  if (syncState === "DISCONNECTED" || syncState === "RECONNECTING") {
    return "disconnected";
  }
  if (syncState === "CONNECTING" || syncState === "CATCHING_UP") {
    return "syncing";
  }
  if (isSyncDataStale(lastEventAtMs, nowMs, staleAfterMs)) {
    return "stale";
  }
  if (syncState === "LIVE") return "live";
  if (syncState === "DEGRADED") return "stale";
  return "syncing";
}
