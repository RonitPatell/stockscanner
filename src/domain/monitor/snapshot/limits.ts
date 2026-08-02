/** Hard caps for the public Monitor snapshot (immediate render only). */
export const MONITOR_SNAPSHOT_MAX_LADDER = 10;
export const MONITOR_SNAPSHOT_MAX_FIELD = 12;
export const MONITOR_SNAPSHOT_MAX_TAPE = 50;

/** Default Redis TTL for snapshot bodies (must exceed production publish interval). */
export const MONITOR_SNAPSHOT_DEFAULT_TTL_SEC = 15 * 60;

/** Default upper-bound publish interval when markets are quiet. */
export const MONITOR_SNAPSHOT_MAX_PUBLISH_INTERVAL_MS = 5_000;

/** Coalesce window for bursty updates. */
export const MONITOR_SNAPSHOT_COALESCE_MS = 250;
