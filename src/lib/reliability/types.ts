export type IndicatorId =
  | "priority_source_ingestion"
  | "feed_availability_market_hours"
  | "in_app_alert_delivery"
  | "provider_connection"
  | "latency_p50"
  | "latency_p90"
  | "duplicate_rate"
  | "timestamp_quality_rate"
  | "source_coverage"
  | "browser_stream_success";

export type IndicatorStatus =
  | "operational"
  | "degraded"
  | "outage"
  | "insufficient_data"
  | "maintenance";

export type LatencyKind = "trustticker_processing" | "upstream_provider" | "total";

export interface ServiceTargets {
  /** Fraction available during window (0–1). Higher is better. */
  prioritySourceIngestionMin: number;
  feedAvailabilityMarketHoursMin: number;
  inAppAlertDeliveryMin: number;
  providerConnectionMin: number;
  /** TrustTicker processing latency only (ms). Lower is better. */
  processingLatencyP50MsMax: number;
  processingLatencyP90MsMax: number;
  /** Upstream/provider fetch latency (ms). Separate from processing. */
  upstreamLatencyP50MsMax: number;
  upstreamLatencyP90MsMax: number;
  duplicateRateMax: number;
  timestampQualityRateMin: number;
  sourceCoverageMin: number;
  browserStreamSuccessMin: number;
  /** Samples required before "achieved" can be true. */
  minSamplesForAchieved: number;
  /** Production verification gate — until true, achieved stays false. */
  productionVerified: boolean;
}

export interface MetricDefinition {
  id: IndicatorId;
  name: string;
  definition: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
  latencyKind?: LatencyKind;
}

export interface IndicatorSample {
  id: IndicatorId;
  measured: number | null;
  sampleSize: number;
  /** Raw sample values preserved for audit — never hide poor performers. */
  rawSamples?: number[];
  windowStart: string;
  windowEnd: string;
  excludedMaintenanceMinutes: number;
  notes?: string[];
}

export interface IndicatorResult {
  id: IndicatorId;
  name: string;
  definition: string;
  unit: string;
  measured: number | null;
  target: number;
  sampleSize: number;
  status: IndicatorStatus;
  /** True only when productionVerified + enough samples + meets target. */
  achieved: boolean;
  note: string;
  latencyKind?: LatencyKind;
}

export type IncidentSeverity = "minor" | "major" | "critical";
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export interface IncidentEvidence {
  capturedAt: string;
  kind: string;
  /** Opaque structured evidence — preserved as-is */
  payload: Record<string, unknown>;
}

export interface ServiceIncidentRecord {
  id: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  endedAt: string | null;
  /** Only exclude from availability when announced before start. */
  announcedMaintenance: boolean;
  announcedAt: string | null;
  components: IndicatorId[];
  sources: string[];
  evidence: IncidentEvidence[];
  affectedSubscriberCount: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDegradationNotice {
  source: string;
  status: IndicatorStatus;
  message: string;
  since: string;
  sampleSize: number;
  measuredAvailability: number | null;
}

export interface LiveConnectionStatus {
  feed: IndicatorStatus;
  browserStream: IndicatorStatus;
  alertDelivery: IndicatorStatus;
  label: string;
  updatedAt: string;
  sampleSizes: {
    feed: number;
    browserStream: number;
    alertDelivery: number;
  };
}

export type CreditEvalStatus =
  | "draft"
  | "previewed"
  | "applied"
  | "rejected"
  | "duplicate_blocked";

export interface SubscriberCreditLine {
  userId: string;
  emailMasked: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  plan: "monthly" | "annual" | "unknown";
  billingPeriodStart: string;
  billingPeriodEnd: string;
  periodFeeCents: number;
  outageMinutesCharged: number;
  periodMinutes: number;
  proposedCreditCents: number;
  alreadyCreditedCents: number;
  /** Cap so we never double-credit beyond period fee. */
  netCreditCents: number;
}

export interface CreditEvaluationPreview {
  evaluationId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  incidentIds: string[];
  status: CreditEvalStatus;
  lines: SubscriberCreditLine[];
  totalProposedCents: number;
  disclaimer: string;
  legalPlaceholder: string;
  /** Explicit: never framed as trading-loss reimbursement */
  notTradingLossReimbursement: true;
}

export interface MonthlyReliabilityReport {
  month: string;
  version: string;
  indicators: IndicatorResult[];
  incidents: Array<{
    id: string;
    title: string;
    severity: IncidentSeverity;
    startedAt: string;
    endedAt: string | null;
    announcedMaintenance: boolean;
  }>;
  sourceNotices: SourceDegradationNotice[];
  sampleNotes: string[];
  disclaimer: string;
  legalPlaceholder: string;
}

export interface AggregatedPublicLatency {
  windowHours: number;
  sampleSize: number;
  /** All samples including poor performers — no cherry-picking. */
  processing: {
    p50Ms: number | null;
    p90Ms: number | null;
    definition: string;
  };
  upstream: {
    p50Ms: number | null;
    p90Ms: number | null;
    definition: string;
  };
  total: {
    p50Ms: number | null;
    p90Ms: number | null;
    definition: string;
  };
  under3mRate: number | null;
  under60sRate: number | null;
  available: boolean;
  note: string;
}
