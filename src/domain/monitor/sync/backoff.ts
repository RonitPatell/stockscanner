import {
  DEFAULT_SYNC_BACKOFF,
  HIDDEN_RECONNECT_MIN_MS,
  type SyncBackoffConfig,
} from "./types.ts";

/**
 * Exponential backoff with jitter. Deterministic when `random` is injected.
 */
export function nextReconnectDelayMs(
  attempt: number,
  config: SyncBackoffConfig = DEFAULT_SYNC_BACKOFF,
  random: () => number = Math.random
): number {
  const exp = Math.min(
    config.maxMs,
    config.baseMs * 2 ** Math.max(0, attempt)
  );
  const jitterSpan = exp * config.jitter;
  const jitter = (random() * 2 - 1) * jitterSpan;
  return Math.max(config.baseMs, Math.round(exp + jitter));
}

/** Slow reconnects while the tab is hidden to avoid storms. */
export function reconnectDelayForVisibility(
  attempt: number,
  documentHidden: boolean,
  config?: SyncBackoffConfig,
  random?: () => number
): number {
  const base = nextReconnectDelayMs(attempt, config, random);
  if (!documentHidden) return base;
  return Math.max(base, HIDDEN_RECONNECT_MIN_MS);
}
