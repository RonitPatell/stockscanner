/** Public Monitor snapshot schema — wire format for Redis/PG/clients. */
export const MONITOR_SNAPSHOT_SCHEMA_VERSION = "monitor-public-snapshot-v1.1";

/**
 * Calculation pipeline version — bump when Momentum / Attention / State /
 * Tradeability / freshness composition rules change.
 */
export const MONITOR_SNAPSHOT_CALCULATION_VERSION =
  "monitor-snapshot-calc-v1.1";
