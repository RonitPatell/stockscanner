/**
 * Normalized Monitor delivery envelopes — snapshots / deltas for clients.
 * Never send raw full-market ticks to normal browsers.
 */

import type { MONITOR_DELIVERY_VERSION } from "./version.ts";

export type DeliveryAvailability =
  | "ok"
  | "unavailable"
  | "stale"
  | "estimated"
  | "degraded";

export type DeliveryHealth =
  | "live"
  | "degraded"
  | "stale"
  | "disconnected"
  | "recovering";

/** Priority for outbound client queues — drop visual before critical. */
export type DeliveryPriority = "critical" | "state" | "visual";

export interface MonitorSymbolDelta {
  symbol: string;
  sequence: number;
  asOfMs: number;
  rank: number | null;
  attentionPriority: number | null;
  momentumState: string | null;
  momentumIntensity: number | null;
  direction: "up" | "down" | "neutral" | null;
  halted: boolean;
  criticalEvent: boolean;
  dataAvailability: DeliveryAvailability;
  /** True when values must not be shown as live */
  stale: boolean;
}

export interface MonitorLadderSnapshot {
  schemaVersion: typeof MONITOR_DELIVERY_VERSION | string;
  sequence: number;
  publishedAtMs: number;
  health: DeliveryHealth;
  /** Compact top-of-book only — not full universe */
  symbols: MonitorSymbolDelta[];
  trackedSymbolCount: number;
  leaderSymbol: string | null;
  dataNotes: string[];
}

export type MonitorStreamMessage =
  | {
      type: "snapshot";
      id: string;
      sequence: number;
      payload: MonitorLadderSnapshot;
    }
  | {
      type: "delta";
      id: string;
      sequence: number;
      priority: DeliveryPriority;
      payload: MonitorSymbolDelta[];
    }
  | {
      type: "heartbeat";
      id: string;
      sequence: number;
      health: DeliveryHealth;
      lagMs: number;
      publishedAtMs: number;
    }
  | {
      type: "health";
      id: string;
      sequence: number;
      health: DeliveryHealth;
      reason: string;
      publishedAtMs: number;
    }
  | {
      type: "entitlement_revoked";
      id: string;
      code: "PRO_REQUIRED";
    }
  | {
      type: "ack_request";
      id: string;
      sequence: number;
    }
  | {
      type: "catchup_start";
      id: string;
      fromEventId: string;
      mode: "replay" | "full_snapshot";
      reason: string;
    }
  | {
      type: "catchup_complete";
      id: string;
      lastEventId: string;
      replayed: number;
    }
  | {
      type: "resync_required";
      id: string;
      sequence: number;
      reason: string;
      payload: MonitorLadderSnapshot;
    }
  | {
      type: "connected";
      lastEventId: string | null;
      heartbeatMs: number;
      syncPhase: "catchup" | "live";
    };

export interface DeliveryMetrics {
  eventsIn: number;
  eventsDroppedSource: number;
  eventsDroppedLag: number;
  eventsDroppedBackpressure: number;
  eventsDroppedObsoleteVisual: number;
  publishedSnapshots: number;
  publishedDeltas: number;
  lagMsAvg: number;
  lagMsMax: number;
  inboundQueueDepth: number;
  outboundQueueDepth: number;
  clientAcks: number;
  circuitSource: "closed" | "open" | "half_open";
  circuitProcessing: "closed" | "open" | "half_open";
  trackedSymbols: number;
  lastPublishMs: number;
  health: DeliveryHealth;
}

/** Inbound normalized market event (worker → hub). Not a raw exchange tick dump. */
export interface NormalizedMarketEvent {
  symbol: string;
  observedAtMs: number;
  ingestedAtMs: number;
  price: number | null;
  changePercent: number | null;
  relativeVolume: number | null;
  tradesPerSecond: number | null;
  halted?: boolean;
  criticalEvent?: boolean;
  momentumState?: string | null;
  momentumIntensity?: number | null;
  attentionPriority?: number | null;
  direction?: "up" | "down" | "neutral" | null;
  availability?: DeliveryAvailability;
}
