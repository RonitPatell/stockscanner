/** Queue classes — never blend into one poll loop. */
export type AlertQueueClass =
  | "primary_filings"
  | "licensed_news"
  | "editorial_news"
  | "market_events"
  | "enrichment";

export const ALERT_QUEUE_CLASSES: AlertQueueClass[] = [
  "primary_filings",
  "licensed_news",
  "editorial_news",
  "market_events",
  "enrichment",
];

export type AlertChannel =
  | "browser"
  | "in_app"
  | "discord"
  | "sms"
  | "email"
  | "push";

export type DeliveryLifecycleStatus =
  | "accepted"
  | "queued"
  | "delivered"
  | "failed"
  | "acknowledged"
  | "expired";

export type AlertEventPhase = "preliminary" | "enriched" | "expired";

export interface AlertEventEnvelope {
  /** Stable idempotency key for the story (not versioned). */
  eventId: string;
  /** 1 = preliminary publish; 2+ = enrichment updates. */
  version: number;
  phase: AlertEventPhase;
  queue: AlertQueueClass;
  catalystId: string;
  rawNewsId: string;
  symbol: string;
  headline: string;
  source: string;
  sourceTier: string | null;
  publishedAt: string;
  timestampQuality: string | null;
  /** Provider time may be unreliable — suppress absolute latency claims. */
  providerTimestampUnreliable: boolean;
  createdAt: string;
  /** Payload for enrichment workers (JSON-safe). */
  enrichmentHints?: {
    needsQuote?: boolean;
    needsHistorical?: boolean;
    needsDilution?: boolean;
    needsRvol?: boolean;
  };
  attempt?: number;
}

export interface QueueJob {
  id: string;
  envelope: AlertEventEnvelope;
  enqueuedAt: string;
  availableAt: string;
  attempt: number;
}

export interface ChannelDeliveryRecord {
  eventId: string;
  eventVersion: number;
  userId: string | null;
  catalystId: string | null;
  channel: AlertChannel;
  status: DeliveryLifecycleStatus;
  acceptedAt: string | null;
  queuedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  acknowledgedAt: string | null;
  expiredAt: string | null;
  error: string | null;
  latencyMs: number | null;
}

export interface SourceHeartbeat {
  sourceId: string;
  provider: string;
  lastBeatAt: string;
  lastCursor: string | null;
  consecutiveMisses: number;
  gapDetected: boolean;
  lastGapAt: string | null;
  connectionMode: "stream" | "poll" | "recovery_poll";
}

export interface ServiceTargetConfig {
  providerToIngestionP50Ms: number;
  providerToIngestionP90Ms: number;
  ingestionToClassificationP50Ms: number;
  ingestionToClassificationP90Ms: number;
  classificationToInAppP50Ms: number;
  classificationToInAppP90Ms: number;
  alertChannelSuccessRateMin: number;
  duplicateRateMax: number;
  dataGapsPerHourMax: number;
}

export interface TargetComparison {
  metric: string;
  target: number;
  measured: number | null;
  sampleSize: number;
  /** Never true unless measured against production samples meeting min size. */
  achieved: boolean;
  note: string;
}
