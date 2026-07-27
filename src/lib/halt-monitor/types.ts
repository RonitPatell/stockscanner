/** Official-source Halt Monitor — never invents resumption times. */

export type HaltAlertTransition =
  | "HALTED"
  | "NEWS_RELEASED"
  | "RESUMPTION_QUOTE_SCHEDULED"
  | "RESUMED"
  | "REHALTED";

export type HaltLifecycleStatus =
  | "trading"
  | "halted"
  | "news_disseminated"
  | "resumption_quote_scheduled"
  | "resumed"
  | "unknown";

export type NewsDisseminationStatus =
  | "unknown"
  | "pending"
  | "disseminated"
  | "not_applicable";

export type ReconciliationStatus =
  | "single_source"
  | "agreed"
  | "disagreement"
  | "official_preferred"
  | "stale_provider"
  | "missing_update";

export type HaltConfidence = "high" | "medium" | "low" | "unavailable";

export type HaltProviderKind = "official_exchange" | "licensed_luld" | "headline_hint";

/** Nasdaq / regulatory halt codes we recognize (educational + routing). */
export type NasdaqHaltCode =
  | "T1"
  | "T2"
  | "T3"
  | "T5"
  | "T6"
  | "T8"
  | "T12"
  | "H4"
  | "H9"
  | "H10"
  | "H11"
  | "H12"
  | "LUDP"
  | "LUDS"
  | "M"
  | "OTHER"
  | "UNKNOWN";

export interface HaltProviderEvent {
  symbol: string;
  exchange: string | null;
  haltCode: NasdaqHaltCode | string;
  haltReason: string | null;
  /** ISO — required for ordering */
  eventAt: string;
  /** Lifecycle hint from provider payload */
  lifecycle?: HaltLifecycleStatus | null;
  newsDisseminationStatus?: NewsDisseminationStatus | null;
  /** Official only — never estimate */
  officialResumptionQuoteAt?: string | null;
  officialResumptionTradeAt?: string | null;
  lastPriceBeforeHalt?: number | null;
  lastSpreadBeforeHalt?: number | null;
  volumeBeforeHalt?: number | null;
  source: string;
  sourceKind: HaltProviderKind;
  sourceTimestamp: string;
  rawPayload?: unknown;
}

export interface HaltRecord {
  id: string;
  symbol: string;
  exchange: string | null;
  haltCode: string;
  haltReason: string | null;
  haltStartAt: string;
  newsDisseminationStatus: NewsDisseminationStatus;
  /** null = not yet announced — never invent */
  officialResumptionQuoteAt: string | null;
  officialResumptionTradeAt: string | null;
  lastPriceBeforeHalt: number | null;
  lastSpreadBeforeHalt: number | null;
  volumeBeforeHalt: number | null;
  catalystIds: string[];
  filingOrNewsIds: string[];
  source: string;
  sourceKind: HaltProviderKind;
  sourceTimestamp: string;
  confidence: HaltConfidence;
  reconciliationStatus: ReconciliationStatus;
  lifecycle: HaltLifecycleStatus;
  sessionDateEt: string;
  monitorVersion: string;
  updatedAt: string;
}

export interface HaltTransitionRecord {
  id: string;
  haltId: string;
  symbol: string;
  fromLifecycle: HaltLifecycleStatus | null;
  toLifecycle: HaltLifecycleStatus;
  alertTransition: HaltAlertTransition;
  haltCode: string;
  at: string;
  source: string;
  sourceKind: HaltProviderKind;
  detail: string;
  suppressedDuplicate: boolean;
}

export interface HaltProvider {
  id: string;
  kind: HaltProviderKind;
  /** Fetch current/open halts (and recent resumptions when available). */
  fetchHalts(symbols?: string[]): Promise<HaltProviderEvent[]>;
  /** Optional heartbeat for gap detection */
  lastSuccessAt?: string | null;
}

export interface HaltReconcileResult {
  record: HaltRecord;
  transitions: HaltTransitionRecord[];
  disagreements: string[];
}
