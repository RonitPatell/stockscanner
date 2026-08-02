import type { MonitorTapeEventType, TapeSeverity } from "./types.ts";

/** Default Event Tape tuning — inspection cadence, not trade signals. */
export const EVENT_TAPE_CONFIG = {
  /** Max retained items server-side (controlled history). */
  retentionMaxItems: 5_000,
  /** Wall-clock retention window. */
  retentionMs: 36 * 60 * 60 * 1000,
  /** Same fingerprint cooldown (ms). */
  cooldownMs: 45_000,
  /** Hysteresis: ignore reverse flips within this window. */
  hysteresisMs: 20_000,
  /** Cluster window for related events on the same symbol. */
  clusterWindowMs: 90_000,
  /** Max members kept on a cluster summary. */
  clusterMaxMembers: 12,
  /** Default list page size for API. */
  defaultListLimit: 250,
  /** Absolute API cap. */
  maxListLimit: 1_000,
} as const;

/** Types treated as risk-filter matches. */
export const RISK_TAPE_TYPES: ReadonlySet<MonitorTapeEventType> = new Set([
  "HALTED",
  "NEWS_RELEASED_DURING_HALT",
  "DILUTION_RISK",
  "OFFERING",
  "STALE_NEWS",
  "SPREAD_WIDENING",
  "DATA_DEGRADED",
]);

/** Types treated as market-structure / momentum filter matches. */
export const MARKET_TAPE_TYPES: ReadonlySet<MonitorTapeEventType> = new Set([
  "VERIFIED_CATALYST",
  "CATALYST_CORRECTION",
  "MOMENTUM_EMERGING",
  "MOMENTUM_BUILDING",
  "MOMENTUM_BREAKING",
  "MOMENTUM_COOLING",
  "MOMENTUM_FADING",
  "MOMENTUM_RECLAIMING",
  "HOD_BREAK",
  "LOD_BREAK",
  "VOLUME_BURST",
  "TRADE_RATE_BURST",
  "SPREAD_NORMALIZED",
  "RESUMPTION_SCHEDULED",
  "RESUMED",
  "DATA_RECOVERED",
]);

/** Opposite pairs for hysteresis (A suppresses B shortly after A). */
export const HYSTERESIS_PAIRS: ReadonlyArray<
  readonly [MonitorTapeEventType, MonitorTapeEventType]
> = [
  ["MOMENTUM_BUILDING", "MOMENTUM_COOLING"],
  ["MOMENTUM_BREAKING", "MOMENTUM_FADING"],
  ["MOMENTUM_COOLING", "MOMENTUM_RECLAIMING"],
  ["SPREAD_WIDENING", "SPREAD_NORMALIZED"],
  ["DATA_DEGRADED", "DATA_RECOVERED"],
  ["HALTED", "RESUMED"],
];

export const DEFAULT_SEVERITY: Record<MonitorTapeEventType, TapeSeverity> = {
  VERIFIED_CATALYST: "high",
  CATALYST_CORRECTION: "high",
  MOMENTUM_EMERGING: "low",
  MOMENTUM_BUILDING: "medium",
  MOMENTUM_BREAKING: "high",
  MOMENTUM_COOLING: "medium",
  MOMENTUM_FADING: "medium",
  MOMENTUM_RECLAIMING: "medium",
  HOD_BREAK: "high",
  LOD_BREAK: "high",
  VOLUME_BURST: "medium",
  TRADE_RATE_BURST: "medium",
  SPREAD_WIDENING: "medium",
  SPREAD_NORMALIZED: "info",
  HALTED: "critical",
  NEWS_RELEASED_DURING_HALT: "critical",
  RESUMPTION_SCHEDULED: "high",
  RESUMED: "high",
  DILUTION_RISK: "high",
  OFFERING: "critical",
  STALE_NEWS: "medium",
  DATA_DEGRADED: "medium",
  DATA_RECOVERED: "info",
};
