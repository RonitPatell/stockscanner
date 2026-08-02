/** Deterministic calculation version for Monitor rolling market state. */
export const MONITOR_MARKET_STATE_VERSION = "monitor-market-state-v1.0";

export const WINDOW_MS = {
  w5s: 5_000,
  w15s: 15_000,
  w30s: 30_000,
  w1m: 60_000,
  w3m: 180_000,
  w5m: 300_000,
} as const;

export type WindowKey = keyof typeof WINDOW_MS | "session";

export const WINDOW_KEYS: WindowKey[] = [
  "w5s",
  "w15s",
  "w30s",
  "w1m",
  "w3m",
  "w5m",
  "session",
];
