/**
 * Vendor-neutral US equities market-data events for TrustTicker Monitor.
 * Domain-only — no React, Prisma, Redis, Stripe, or browser APIs.
 */

export type MarketDataProviderId =
  | "fake"
  | "yahoo"
  | "finnhub"
  | "polygon"
  | "licensed_sip"
  | "official_halt"
  | string;

/** How the plan may use this payload. */
export type DataEntitlement =
  | "realtime"
  | "delayed"
  | "nbbo"
  | "trades_only"
  | "aggregates_only"
  | "status_only"
  | "none";

export type QuoteQuality =
  | "nbbo"
  | "bbo"
  | "last_sale_derived"
  | "indicative"
  | "stale"
  | "unknown";

export type TapeId = "A" | "B" | "C" | "unknown";

export type MarketEventType =
  | "trade"
  | "nbbo_quote"
  | "aggregate_1s"
  | "aggregate_1m"
  | "luld"
  | "halt"
  | "symbol_status"
  | "connection_health";

export interface MarketEventBase {
  type: MarketEventType;
  schemaVersion: string;
  symbol: string;
  provider: MarketDataProviderId;
  sequenceNumber: number;
  providerReceivedAt: string;
  trustTickerReceivedAt: string;
  dataEntitlement: DataEntitlement;
  /** Explicit delay when known (SIP lag, plan delay, etc.). */
  delayedByMs?: number | null;
}

export interface NormalizedTrade extends MarketEventBase {
  type: "trade";
  price: number;
  size: number;
  exchange: string;
  conditions: string[];
  participantTimestamp: string;
  sipTimestamp: string;
  tape: TapeId;
}

export interface NormalizedNbboQuote extends MarketEventBase {
  type: "nbbo_quote";
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  bidExchange: string;
  askExchange: string;
  sipTimestamp: string;
  quoteQuality: QuoteQuality;
}

export interface NormalizedAggregate extends MarketEventBase {
  type: "aggregate_1s" | "aggregate_1m";
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number | null;
  tradeCount?: number | null;
  windowStart: string;
  windowEnd: string;
}

export type LuldBandSide = "upper" | "lower" | "both" | "unknown";

export interface NormalizedLuldEvent extends MarketEventBase {
  type: "luld";
  status: "limit_state" | "straddle_state" | "cleared" | "unknown";
  bandSide: LuldBandSide;
  upperPrice?: number | null;
  lowerPrice?: number | null;
  eventAt: string;
  exchange?: string | null;
}

export type HaltLifecycle =
  | "halted"
  | "news_disseminated"
  | "resumption_quote_scheduled"
  | "resumed"
  | "unknown";

export interface NormalizedHaltEvent extends MarketEventBase {
  type: "halt";
  lifecycle: HaltLifecycle;
  haltCode: string;
  exchange?: string | null;
  eventAt: string;
  /** Official only — never estimated in adapters. */
  officialResumptionQuoteAt?: string | null;
  officialResumptionTradeAt?: string | null;
}

export type SymbolTradingStatus =
  | "trading"
  | "halted"
  | "paused"
  | "closed"
  | "unknown";

export interface NormalizedSymbolStatus extends MarketEventBase {
  type: "symbol_status";
  status: SymbolTradingStatus;
  eventAt: string;
  detail?: string | null;
}

export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "failed"
  | "backfilling";

export interface NormalizedConnectionHealth extends MarketEventBase {
  type: "connection_health";
  /** Connection health is provider-scoped; symbol may be "*". */
  state: ConnectionState;
  attempt?: number | null;
  nextRetryMs?: number | null;
  lastError?: string | null;
  subscribedSymbols?: string[];
  notes?: string | null;
}

export type NormalizedMarketEvent =
  | NormalizedTrade
  | NormalizedNbboQuote
  | NormalizedAggregate
  | NormalizedLuldEvent
  | NormalizedHaltEvent
  | NormalizedSymbolStatus
  | NormalizedConnectionHealth;

export type SequenceDisposition =
  | "accept"
  | "duplicate"
  | "out_of_order"
  | "sequence_gap"
  | "reject";

export interface SequenceDecision {
  disposition: SequenceDisposition;
  reason: string;
  expectedSequence?: number | null;
  gapFrom?: number | null;
  gapTo?: number | null;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
  rawType?: string;
}

export interface ValidationSuccess {
  ok: true;
  event: NormalizedMarketEvent;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export interface IngestAccept {
  ok: true;
  event: NormalizedMarketEvent;
  sequence: SequenceDecision;
  warnings: string[];
}

export interface IngestReject {
  ok: false;
  errors: string[];
  sequence?: SequenceDecision;
  warnings: string[];
}

export type IngestResult = IngestAccept | IngestReject;

/** Plan capabilities — injected; never trust the client alone. */
export interface MarketDataPlanEntitlements {
  realtimeTrades: boolean;
  realtimeNbbo: boolean;
  delayedOk: boolean;
  aggregates: boolean;
  luld: boolean;
  haltStatus: boolean;
  maxSymbols: number;
  /** Soft delay applied when plan is delayed-only (ms). */
  delayMsWhenDelayed?: number;
}

export interface ProviderCapabilities {
  trades: boolean;
  nbbo: boolean;
  aggregate1s: boolean;
  aggregate1m: boolean;
  luld: boolean;
  halt: boolean;
  symbolStatus: boolean;
  gapBackfill: boolean;
  realtime: boolean;
}

export interface SubscribeRequest {
  symbols: string[];
  channels: Array<
    | "trades"
    | "nbbo"
    | "aggregate_1s"
    | "aggregate_1m"
    | "luld"
    | "halt"
    | "symbol_status"
  >;
  entitlements: MarketDataPlanEntitlements;
}

export interface BackfillRequest {
  symbol: string;
  fromSequence: number;
  toSequence: number;
  channel: "trades" | "nbbo" | "aggregate_1s" | "aggregate_1m";
}

export interface ProviderDisagreement {
  symbol: string;
  field: string;
  providers: Array<{ provider: MarketDataProviderId; value: number; asOf: string }>;
  maxAbsDiff: number;
  maxRelDiff: number;
}
