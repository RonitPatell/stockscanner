/**
 * Monitor Operations — admin control plane types.
 * Domain-only: no React/Prisma/Redis. Never carry provider secrets.
 */

import type { DeliveryHealth, DeliveryMetrics } from "../delivery/types.ts";
import type { MONITOR_OPS_VERSION } from "./version.ts";

/** Sensitive mutations require an exact confirm token (server-validated). */
export const MONITOR_OPS_CONFIRM = {
  disable_provider: "DISABLE_PROVIDER",
  enable_provider: "ENABLE_PROVIDER",
  disable_calculation_version: "DISABLE_CALCULATION_VERSION",
  enable_calculation_version: "ENABLE_CALCULATION_VERSION",
  freeze_leader_selection: "FREEZE_LEADER_SELECTION",
  unfreeze_leader_selection: "UNFREEZE_LEADER_SELECTION",
  disable_monitor_global: "DISABLE_MONITOR_GLOBAL",
  enable_monitor_global: "ENABLE_MONITOR_GLOBAL",
  rollback_feature_flag_cohort: "ROLLBACK_FEATURE_FLAG_COHORT",
  quarantine_ticker: "QUARANTINE_TICKER",
  release_ticker: "RELEASE_TICKER",
  reprocess_replay_window: "REPROCESS_REPLAY_WINDOW",
  /** Instant kill-switch: global disable + rollback cohort. */
  one_click_rollback: "ONE_CLICK_ROLLBACK",
  set_rollout_stage: "SET_ROLLOUT_STAGE",
  attest_expansion_gates: "ATTEST_EXPANSION_GATES",
} as const;

export type MonitorOpsAction = keyof typeof MONITOR_OPS_CONFIRM;

export type MonitorOpsConfirmToken =
  (typeof MONITOR_OPS_CONFIRM)[MonitorOpsAction];

export interface MonitorOpsControls {
  schemaVersion: typeof MONITOR_OPS_VERSION | string;
  updatedAtMs: number;
  /** When true, Monitor surfaces and live delivery refuse new work. */
  monitorGloballyDisabled: boolean;
  /** Provider ids that must not ingest (never store secrets here). */
  disabledProviders: string[];
  /** Calculation version ids that must not run (e.g. monitor-momentum-v1.0). */
  disabledCalculationVersions: string[];
  /** When set, leader auto-selection is frozen on this symbol (or null freeze = freeze current). */
  leaderSelectionFrozen: boolean;
  frozenLeaderSymbol: string | null;
  /** Feature-flag cohort rolled back to a prior named cohort id. */
  featureFlagCohort: string | null;
  /** Quarantined tickers excluded from ranking / field. */
  quarantinedTickers: string[];
}

export function defaultMonitorOpsControls(
  nowMs = Date.now()
): MonitorOpsControls {
  return {
    schemaVersion: "monitor-ops-v1.0",
    updatedAtMs: nowMs,
    monitorGloballyDisabled: false,
    disabledProviders: [],
    disabledCalculationVersions: [],
    leaderSelectionFrozen: false,
    frozenLeaderSymbol: null,
    featureFlagCohort: null,
    quarantinedTickers: [],
  };
}

export interface ProviderConnectionRow {
  id: string;
  label: string;
  /** Whether credentials appear configured — never the secret itself. */
  configured: boolean;
  enabled: boolean;
  state: "connected" | "degraded" | "disconnected" | "disabled" | "unknown";
  lastError: string | null;
  subscribedSymbolCount: number | null;
}

export interface LiveOperationsSection {
  providers: ProviderConnectionRow[];
  processingLagMsAvg: number;
  processingLagMsMax: number;
  inboundQueueDepth: number;
  outboundQueueDepth: number;
  activeSymbols: number;
  trackedSymbols: number;
  activeClients: number;
  clientAcks: number;
  dropped: {
    source: number;
    lag: number;
    backpressure: number;
    obsoleteVisual: number;
    rejected: number;
  };
  sequence: {
    latest: number;
    gapsObserved: number;
    missingSequenceEvents: number;
  };
  streamAcknowledgement: {
    ackCount: number;
    lastPublishMs: number;
    health: DeliveryHealth;
    circuits: {
      source: DeliveryMetrics["circuitSource"];
      processing: DeliveryMetrics["circuitProcessing"];
    };
  };
}

export interface MomentumQualitySection {
  currentLeaders: Array<{
    symbol: string;
    rank: number | null;
    attentionPriority: number | null;
    momentumState: string | null;
    intensity: number | null;
  }>;
  leaderTransitions: Array<{
    atMs: number;
    from: string | null;
    to: string | null;
    reason: string;
  }>;
  momentumStateDistribution: Record<string, number>;
  stateFlapping: Array<{
    symbol: string;
    transitionsRecent: number;
    windowMs: number;
  }>;
  lowConfidenceScores: Array<{
    symbol: string;
    confidence: string;
    note: string;
  }>;
  onePrintAnomalies: Array<{
    symbol: string;
    atMs: number;
    note: string;
  }>;
  calculationVersions: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
}

export interface DataQualitySection {
  staleQuotes: Array<{ symbol: string; asOfMs: number; ageMs: number }>;
  crossedMarkets: Array<{ symbol: string; note: string; atMs: number }>;
  invalidPrices: Array<{ symbol: string; note: string; atMs: number }>;
  missingSequenceNumbers: number;
  ambiguousTickerResolution: Array<{
    raw: string;
    candidates: string[];
    atMs: number;
  }>;
  providerDisagreement: Array<{
    symbol: string;
    field: string;
    providers: string[];
    atMs: number;
  }>;
  haltSourceDisagreement: Array<{
    symbol: string;
    sources: string[];
    atMs: number;
  }>;
}

export interface CalibrationOpsSection {
  replaySessions: Array<{
    id: string;
    frameCount: number;
    fromMs: number;
    toMs: number;
  }>;
  candidateEngineComparison: {
    available: boolean;
    note: string;
    lastShadow: {
      productionEngine: string;
      candidateEngine: string;
      pairs: number;
      stateAgreementRate: number | null;
      userOutputUnchanged: true;
    } | null;
  };
  configurationVersions: Array<{ id: string; value: string }>;
  outcomeDistributions: {
    sampleFrames: number;
    intensityByState: Array<{
      state: string;
      n: number;
      mean: number;
    }>;
    disclaimer: string;
  } | null;
}

export interface MonitorOpsAuditRow {
  id: string;
  actorUserId: string;
  action: string;
  confirmToken: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface MonitorOpsRolloutSection {
  stage: string | null;
  stageLabel: string | null;
  stages: Array<{ id: string; label: string; description: string }>;
  expansionGates: Record<string, { label: string; clear: boolean }>;
  gatesAllClear: boolean;
  gatesMissing: string[];
  subsystemFlags: Record<string, boolean>;
  build: {
    buildId: string;
    gitSha: string | null;
    nodeEnv: string;
    rolloutControlVersion: string;
    engines: Array<{ id: string; version: string }>;
    disclaimer: string;
  };
  betaFeedbackCount: number;
  errorSessionCount: number;
  recentErrorSessions: Array<{
    id: string;
    atMs: number;
    message: string;
    path: string | null;
  }>;
  recentBetaFeedback: Array<{
    id: string;
    atMs: number;
    category: string;
    message: string;
    stage: string | null;
  }>;
  metricsDisclaimer: string;
}

export interface MonitorOpsDashboard {
  version: string;
  generatedAtMs: number;
  controls: MonitorOpsControls;
  live: LiveOperationsSection;
  momentumQuality: MomentumQualitySection;
  dataQuality: DataQualitySection;
  calibration: CalibrationOpsSection;
  recentAudit: MonitorOpsAuditRow[];
  notes: string[];
  rollout: MonitorOpsRolloutSection;
}

/** Quality anomaly ring — append-only operational observations (not silent history rewrites). */
export type MonitorOpsQualityKind =
  | "sequence_gap"
  | "missing_sequence"
  | "stale_quote"
  | "crossed_market"
  | "invalid_price"
  | "ambiguous_ticker"
  | "provider_disagreement"
  | "halt_source_disagreement"
  | "state_flap"
  | "one_print"
  | "low_confidence"
  | "leader_transition"
  | "rejected_event";

export interface MonitorOpsQualityEvent {
  id: string;
  kind: MonitorOpsQualityKind;
  atMs: number;
  symbol?: string | null;
  note: string;
  meta?: Record<string, string | number | boolean | null>;
}
