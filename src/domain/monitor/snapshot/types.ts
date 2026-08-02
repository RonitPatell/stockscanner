/**
 * Continuously maintained public Monitor snapshot.
 * Watchlist-independent, server-built, safe for Pro clients.
 */

import type { SessionSegment } from "../market-state/session.ts";
import type { MomentumConfidence, MomentumDirection } from "../momentum/types.ts";
import type { ReactionStage } from "../attention/types.ts";
import type { MonitorTapeEventType, TapeSeverity } from "../event-tape/types.ts";
import type {
  MONITOR_SNAPSHOT_CALCULATION_VERSION,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
} from "./version.ts";

export type SnapshotDataConfidence = MomentumConfidence;

export type SnapshotTradeability =
  | "LIQUID"
  | "ACCEPTABLE"
  | "THIN"
  | "EXTREMELY_THIN"
  | "UNKNOWN";

export type SnapshotPrimaryRisk =
  | "halt"
  | "dilution"
  | "offering"
  | "spread"
  | "stale_data"
  | "regulatory"
  | "none"
  | "unknown";

export type SnapshotHaltState =
  | "none"
  | "halted"
  | "news_disseminated"
  | "resumption_scheduled"
  | "resumed";

export type SnapshotDataQuality =
  | "high"
  | "medium"
  | "low"
  | "degraded"
  | "unavailable";

export type FreshnessDataKind =
  | "quote"
  | "trade"
  | "catalyst"
  | "halt"
  | "momentum"
  | "attention"
  | "tradeability"
  | "market_event";

export type FreshnessVerdict =
  | "fresh"
  | "aging"
  | "stale"
  | "unavailable"
  | "quarantined";

export type SnapshotTimestampQuality =
  | "provider"
  | "estimated"
  | "invalid"
  | "missing";

export type TickerActivityLevel = "quiet" | "active" | "burst";

export type SnapshotLiveLabel =
  | "live"
  | "aging"
  | "stale"
  | "recovery"
  | "unavailable";

export type SnapshotSourceChannelHealth =
  | "ok"
  | "degraded"
  | "stale"
  | "down";

export interface SnapshotSourceHealthSummary {
  quotes: SnapshotSourceChannelHealth;
  catalysts: SnapshotSourceChannelHealth;
  halts: SnapshotSourceChannelHealth;
  coverage: SnapshotSourceChannelHealth;
  notes: string[];
}

export interface SnapshotTickerSourceHealth {
  quotes: SnapshotSourceChannelHealth;
  catalysts: SnapshotSourceChannelHealth;
  trades: SnapshotSourceChannelHealth;
  notes: string[];
}

export interface SnapshotFieldFreshness {
  field:
    | "quote"
    | "trade"
    | "catalyst"
    | "momentum"
    | "priority"
    | "tradeability"
    | "market_event";
  verdict: FreshnessVerdict;
  reason: string;
  /** Provider/event time only — never server clock fill. */
  providerTimeMs: number | null;
  timeQuality: SnapshotTimestampQuality;
  ageMs: number | null;
}

export interface SnapshotExclusionRecord {
  symbol: string;
  reason: string;
  stage: "resolve" | "quarantine" | "freshness" | "leader" | "validate";
}

/** Compact catalyst summary — never raw article or filing body. */
export interface SnapshotCatalystSummary {
  headline: string | null;
  category: string | null;
  materiality: number | null;
  verified: boolean;
  firstSeenAtMs: number | null;
  lastConfirmedAtMs: number | null;
}

/**
 * Per-ticker payload for immediate Monitor rendering.
 * Public attributes only — no user decisions or private strategy.
 */
export interface MonitorSnapshotTicker {
  symbol: string;
  companyShortName: string | null;
  price: number | null;
  sessionChangePct: number | null;
  rank: number | null;
  rankChange: number | null;
  momentumIntensity: number | null;
  momentumState: string | null;
  direction: MomentumDirection | null;
  attentionPriority: number | null;
  reactionStage: ReactionStage;
  tradeability: SnapshotTradeability;
  primaryRisk: SnapshotPrimaryRisk;
  catalyst: SnapshotCatalystSummary | null;
  /** @deprecated Prefer lastQuoteAtMs — kept for wire compat. */
  quoteTimestampMs: number | null;
  dataConfidence: SnapshotDataConfidence;
  haltState: SnapshotHaltState;

  /** Build/serialization clock for this ticker row — not live evidence. */
  snapshotGeneratedAtMs: number;
  lastMarketEventAtMs: number | null;
  lastQuoteAtMs: number | null;
  lastTradeAtMs: number | null;
  lastCatalystAtMs: number | null;
  momentumCalculatedAtMs: number | null;
  priorityCalculatedAtMs: number | null;
  tradeabilityCalculatedAtMs: number | null;

  activityLevel: TickerActivityLevel;
  sourceHealth: SnapshotTickerSourceHealth;
  fieldFreshness: SnapshotFieldFreshness[];
  freshnessVerdict: FreshnessVerdict;
  leaderEligible: boolean;
  leaderIneligibleReason: string | null;
  calculationVersion: string;
}

export interface SnapshotFreshnessSummary {
  /** Age of serialization — admin/debug only; never sole live evidence. */
  snapshotAgeMs: number;
  /** Max age across underlying provider market inputs. */
  underlyingDataAgeMs: number | null;
  liveEligible: boolean;
  liveLabel: SnapshotLiveLabel;
  excludedTickers: SnapshotExclusionRecord[];
  leaderExclusions: Array<{ symbol: string; reason: string }>;
  generationDurationMs: number | null;
  schemaVersion: string;
  calculationVersion: string;
}

/** Compact tape row for the public snapshot (no long text). */
export interface MonitorSnapshotTapeItem {
  id: string;
  atMs: number;
  symbol: string;
  type: MonitorTapeEventType | string;
  label: string;
  severity: TapeSeverity | "info";
  explanation: string;
}

export interface MonitorPublicSnapshot {
  schemaVersion: typeof MONITOR_SNAPSHOT_SCHEMA_VERSION | string;
  calculationVersion: typeof MONITOR_SNAPSHOT_CALCULATION_VERSION | string;
  snapshotId: string;
  lastEventId: string;
  generatedAt: string;
  generatedAtMs: number;
  marketSession: SessionSegment;
  globalLeader: string | null;
  priorityLadder: MonitorSnapshotTicker[];
  momentumField: MonitorSnapshotTicker[];
  recentEventTape: MonitorSnapshotTapeItem[];
  sourceHealthSummary: SnapshotSourceHealthSummary;
  dataQuality: SnapshotDataQuality;
  marketStateAgeMs: number | null;
  /** True when intentionally publishing older/recovery market data. */
  recovery: boolean;
  freshness: SnapshotFreshnessSummary;
}

/**
 * Already-normalized inputs for the pure builder.
 * Engines run upstream; this receives their public outputs only.
 */
export interface NormalizedSnapshotTickerInput {
  symbol: string;
  companyShortName?: string | null;
  price?: number | null;
  sessionChangePct?: number | null;
  attentionPriority: number;
  momentumIntensity?: number | null;
  momentumState?: string | null;
  direction?: MomentumDirection | null;
  reactionStage?: ReactionStage | null;
  tradeability?: SnapshotTradeability | null;
  primaryRisk?: SnapshotPrimaryRisk | null;
  catalyst?: SnapshotCatalystSummary | null;
  quoteTimestampMs?: number | null;
  dataConfidence?: SnapshotDataConfidence | null;
  haltState?: SnapshotHaltState | null;
  /** Optional prior rank for rankChange (1-based). */
  previousRank?: number | null;

  lastQuoteAtMs?: number | null;
  lastQuoteAtQuality?: SnapshotTimestampQuality | null;
  lastTradeAtMs?: number | null;
  lastTradeAtQuality?: SnapshotTimestampQuality | null;
  lastCatalystAtMs?: number | null;
  lastCatalystAtQuality?: SnapshotTimestampQuality | null;
  lastMarketEventAtMs?: number | null;
  lastMarketEventAtQuality?: SnapshotTimestampQuality | null;
  momentumCalculatedAtMs?: number | null;
  momentumCalculatedAtQuality?: SnapshotTimestampQuality | null;
  priorityCalculatedAtMs?: number | null;
  priorityCalculatedAtQuality?: SnapshotTimestampQuality | null;
  tradeabilityCalculatedAtMs?: number | null;
  tradeabilityCalculatedAtQuality?: SnapshotTimestampQuality | null;

  activityLevel?: TickerActivityLevel | null;
  tradesPerSecond?: number | null;
  provider?: string | null;
  sourceHealth?: Partial<SnapshotTickerSourceHealth> | null;
  quarantined?: boolean;
  conflictedMapping?: boolean;
}

export interface MonitorSnapshotBuildInput {
  nowMs: number;
  lastEventId: string;
  marketSession: SessionSegment;
  tickers: NormalizedSnapshotTickerInput[];
  tapeEvents?: MonitorSnapshotTapeItem[];
  sourceHealth?: Partial<SnapshotSourceHealthSummary> | null;
  marketStateAgeMs?: number | null;
  dataQuality?: SnapshotDataQuality | null;
  recovery?: boolean;
  /** Optional stable id; otherwise derived from lastEventId + generatedAtMs. */
  snapshotId?: string | null;
  previous?: MonitorPublicSnapshot | null;
  quarantinedSymbols?: string[];
  conflictedSymbols?: string[];
  /** Wall-clock build duration; set by publisher after timing. */
  generationDurationMs?: number | null;
  /** Pre-build exclusions (e.g. from hub mapping). */
  preExcluded?: SnapshotExclusionRecord[];
}

export type SnapshotValidationIssue =
  | { code: string; message: string; path?: string };

export interface SnapshotValidationResult {
  ok: boolean;
  issues: SnapshotValidationIssue[];
}
