export const TIMESTAMP_QUALITIES = [
  "EXACT_PROVIDER",
  "ESTIMATED_PROVIDER",
  "ARTICLE_UPDATED_TIME",
  "MISSING",
  "INVALID",
] as const;

export type TimestampQuality = (typeof TIMESTAMP_QUALITIES)[number];

export const METRIC_COHORTS = [
  "urgent_filing",
  "scheduled_earnings",
  "editorial_recap",
  "actionable_breaking",
  "other",
] as const;

export type MetricCohort = (typeof METRIC_COHORTS)[number];

export const MARKET_SESSIONS = [
  "premarket",
  "regular",
  "afterhours",
  "weekend",
] as const;

export type MarketSession = (typeof MARKET_SESSIONS)[number];

export interface ProviderTimestampParse {
  at: Date | null;
  quality: TimestampQuality;
  raw?: string | null;
}

export interface NewsArticleTraceMeta {
  providerPublishedAt?: Date | null;
  firstFetchedAt?: Date;
  fetchCompletedAt?: Date;
  parsedAt?: Date;
  timestampQuality?: TimestampQuality;
  providerItemId?: string;
}

export interface LatencyTotals {
  fetchLatencyMs: number | null;
  processingLatencyMs: number | null;
  deliveryLatencyMs: number | null;
  totalLatencyMs: number | null;
}

export interface LatencyAggregateStats {
  count: number;
  available: boolean;
  min: number | null;
  max: number | null;
  p50: number | null;
  p90: number | null;
  p99: number | null;
  pctUnder30s: number | null;
  pctUnder60s: number | null;
  pctUnder90s: number | null;
  pctUnder180s: number | null;
}

export interface LatencySegmentKey {
  source?: string;
  sourceTier?: string;
  marketSession?: string;
  catalystType?: string;
  timestampQuality?: string;
  actionable?: boolean;
  metricCohort?: string;
}

export interface LatencySegmentReport {
  key: LatencySegmentKey;
  label: string;
  total: LatencyAggregateStats;
  fetch: LatencyAggregateStats;
  processing: LatencyAggregateStats;
  delivery: LatencyAggregateStats;
}
