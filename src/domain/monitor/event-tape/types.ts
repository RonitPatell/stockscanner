/**
 * TrustTicker Monitor Event Tape — inspection events only.
 * Never encodes buy/sell, expected return, or success probability.
 */

export const MONITOR_TAPE_EVENT_TYPES = [
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
  "SPREAD_WIDENING",
  "SPREAD_NORMALIZED",
  "HALTED",
  "NEWS_RELEASED_DURING_HALT",
  "RESUMPTION_SCHEDULED",
  "RESUMED",
  "DILUTION_RISK",
  "OFFERING",
  "STALE_NEWS",
  "DATA_DEGRADED",
  "DATA_RECOVERED",
] as const;

export type MonitorTapeEventType = (typeof MONITOR_TAPE_EVENT_TYPES)[number];

export type TapeSeverity = "critical" | "high" | "medium" | "low" | "info";

export type TapeSourceType =
  | "catalyst"
  | "momentum"
  | "market_structure"
  | "halt"
  | "risk"
  | "data_quality"
  | "system";

export type TapeDataConfidence =
  | "high"
  | "medium"
  | "low"
  | "degraded"
  | "unavailable";

/** Intelligence panel section to open when the item is selected. */
export type TapeIntelSection =
  | "identity"
  | "current-state"
  | "verified-catalyst"
  | "market-movement"
  | "primary-risks"
  | "event-timeline"
  | "evidence";

export type TapeFilterPreset =
  | "all"
  | "selected"
  | "watchlist"
  | "risk"
  | "market";

export interface MonitorTapeItem {
  id: string;
  schemaVersion: string;
  /** Engine / rule version */
  ruleVersion: string;
  atMs: number;
  symbol: string;
  type: MonitorTapeEventType;
  /** Short human label (never a trade instruction). */
  label: string;
  /** User-readable explanation of what changed. */
  explanation: string;
  severity: TapeSeverity;
  sourceType: TapeSourceType;
  dataConfidence: TapeDataConfidence;
  /** Dedupe fingerprint (symbol|type|bucket). */
  fingerprint: string;
  clusterId: string | null;
  /** Related event ids in the same cluster (including self). */
  clusterMemberIds: string[];
  intelSection: TapeIntelSection;
  /** Optional source attribution (URL never contains secrets). */
  sourceName?: string | null;
  sourceUrl?: string | null;
}

export interface RawTapeSignal {
  type: MonitorTapeEventType;
  symbol: string;
  atMs: number;
  /** Extra context folded into the explanation (plain language). */
  detail?: string | null;
  dataConfidence?: TapeDataConfidence;
  sourceName?: string | null;
  sourceUrl?: string | null;
  /** Optional stable id; otherwise derived. */
  id?: string;
}

export interface TapeIngestResult {
  accepted: MonitorTapeItem[];
  dropped: Array<{
    signal: RawTapeSignal;
    reason: "duplicate" | "cooldown" | "hysteresis" | "invalid";
  }>;
  clustersUpdated: string[];
}

export interface EventTapeStorePort {
  append(items: MonitorTapeItem[]): Promise<void>;
  list(opts?: {
    sinceMs?: number;
    limit?: number;
    symbol?: string;
  }): Promise<MonitorTapeItem[]>;
  size(): Promise<number>;
  clear?(): Promise<void>;
}
