/** Priority ingest tiers — separate schedules/queues; never blend into one poll loop. */
export type IngestTier = 0 | 1 | 2 | 3;

export const INGEST_TIERS: IngestTier[] = [0, 1, 2, 3];

export type MarketPhase = "premarket" | "regular" | "afterhours" | "overnight";

export interface AdaptiveIntervals {
  /** US premarket 04:00–09:30 ET */
  premarket: number;
  /** Regular session 09:30–16:00 ET */
  regular: number;
  /** After-hours 16:00–20:00 ET */
  afterhours: number;
  /** Overnight + weekends */
  overnight: number;
}

export interface SourceRateLimit {
  max: number;
  windowMs: number;
}

export interface CircuitConfig {
  failureThreshold: number;
  coolDownMs: number;
}

export interface SourceDefinition {
  id: string;
  name: string;
  tier: IngestTier;
  /** Shared rate-limit / circuit key (e.g. "sec", "finnhub"). */
  provider: string;
  /** Redis lock partition — only one worker processes this partition. */
  partition: string;
  /** Env flag: INGEST_SOURCE_<ID>_ENABLED=false disables. */
  featureFlag: string;
  intervals: AdaptiveIntervals;
  rateLimit: SourceRateLimit;
  circuit: CircuitConfig;
  /** SEC EDGAR paths — subject to aggregate <10 rps + declared UA. */
  isSec?: boolean;
  /** Requires env key to be considered enabled (e.g. BENZINGA_API_KEY). */
  requiresEnv?: string;
}

export type CircuitState = "closed" | "open" | "half_open";

export interface SourceHealthStatus {
  sourceId: string;
  tier: IngestTier;
  enabled: boolean;
  circuit: CircuitState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  lastResponseMs: number | null;
  lastItemsReceived: number;
  lastError: string | null;
  nextEligibleAt: string | null;
}

export interface DeadLetterItem {
  id: string;
  sourceId: string;
  tier: IngestTier;
  error: string;
  attempt: number;
  payloadSummary: string;
  createdAt: string;
  lastAttemptAt: string;
}

export interface TierRunResult {
  tier: IngestTier;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesSkipped: number;
  sourcesFailed: number;
  articlesFetched: number;
  articlesIngested: number;
  lockContention: number;
  finishedAt: string;
}
