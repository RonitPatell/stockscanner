import {
  assertSubscribeAllowed,
  buildConnectionHealth,
  MONITOR_MARKET_DATA_VERSION,
} from "../../../domain/monitor/market-data/index.ts";
import type {
  MarketDataListener,
  MarketDataProvider,
} from "../../../domain/monitor/market-data/ports.ts";
import type {
  BackfillRequest,
  NormalizedMarketEvent,
  NormalizedTrade,
  ProviderCapabilities,
  SubscribeRequest,
} from "../../../domain/monitor/market-data/types.ts";
import { ReconnectController } from "../../../domain/monitor/market-data/backoff.ts";

/**
 * Deterministic in-memory provider for tests and local Monitor dry-runs.
 * No network; no secrets.
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  readonly id = "fake" as const;
  readonly capabilities: ProviderCapabilities = {
    trades: true,
    nbbo: true,
    aggregate1s: true,
    aggregate1m: true,
    luld: true,
    halt: true,
    symbolStatus: true,
    gapBackfill: true,
    realtime: true,
  };

  private connected = false;
  private listeners = new Set<MarketDataListener>();
  private symbols = new Set<string>();
  private seqBySymbol = new Map<string, number>();
  private tradeLog = new Map<string, NormalizedTrade[]>();
  private readonly reconnect: ReconnectController;
  private lastSubscribe: SubscribeRequest | null = null;

  constructor(
    opts?: ConstructorParameters<typeof ReconnectController>[0]
  ) {
    this.reconnect = new ReconnectController(opts);
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.reconnect.reset();
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "connected",
        attempt: 0,
        subscribedSymbols: [...this.symbols],
      })
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "disconnected",
        subscribedSymbols: [...this.symbols],
      })
    );
  }

  async subscribe(req: SubscribeRequest): Promise<void> {
    assertSubscribeAllowed(req);
    this.lastSubscribe = req;
    for (const s of req.symbols) this.symbols.add(s.toUpperCase());
    if (!this.connected) await this.connect();
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "connected",
        subscribedSymbols: [...this.symbols],
        notes: `channels=${req.channels.join(",")}`,
      })
    );
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    for (const s of symbols) this.symbols.delete(s.toUpperCase());
  }

  onEvent(listener: MarketDataListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Simulate transport drop + exponential backoff reconnect. */
  async simulateReconnect(): Promise<{ attempt: number; delayMs: number }> {
    this.connected = false;
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "disconnected",
        lastError: "simulated_drop",
      })
    );
    const result = await this.reconnect.waitAndReconnect(async () => {
      this.connected = true;
    });
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "reconnecting",
        attempt: result.attempt,
        nextRetryMs: 0,
        notes: `reconnected_after_${result.delayMs}ms`,
      })
    );
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "connected",
        attempt: result.attempt,
        subscribedSymbols: [...this.symbols],
      })
    );
    return result;
  }

  nextSequence(symbol: string): number {
    const sym = symbol.toUpperCase();
    const n = (this.seqBySymbol.get(sym) ?? 0) + 1;
    this.seqBySymbol.set(sym, n);
    return n;
  }

  /** Peek current sequence without incrementing. */
  currentSequence(symbol: string): number {
    return this.seqBySymbol.get(symbol.toUpperCase()) ?? 0;
  }

  emitTrade(
    partial: Omit<
      NormalizedTrade,
      | "type"
      | "schemaVersion"
      | "provider"
      | "sequenceNumber"
      | "trustTickerReceivedAt"
    > &
      Partial<
        Pick<
          NormalizedTrade,
          "sequenceNumber" | "trustTickerReceivedAt" | "provider"
        >
      >
  ): NormalizedTrade {
    const now = new Date().toISOString();
    const sym = partial.symbol.toUpperCase();
    const sequenceNumber =
      partial.sequenceNumber ?? this.nextSequence(sym);
    if (
      partial.sequenceNumber != null &&
      partial.sequenceNumber > (this.seqBySymbol.get(sym) ?? 0)
    ) {
      this.seqBySymbol.set(sym, partial.sequenceNumber);
    }
    const trade: NormalizedTrade = {
      type: "trade",
      schemaVersion: MONITOR_MARKET_DATA_VERSION,
      delayedByMs: null,
      ...partial,
      symbol: sym,
      tape: partial.tape ?? "C",
      provider: partial.provider ?? this.id,
      sequenceNumber,
      trustTickerReceivedAt: partial.trustTickerReceivedAt ?? now,
    };
    const list = this.tradeLog.get(trade.symbol) ?? [];
    list.push(trade);
    this.tradeLog.set(trade.symbol, list);
    this.emit(trade);
    return trade;
  }

  emitRaw(event: NormalizedMarketEvent): void {
    this.emit(event);
  }

  async backfillGaps(req: BackfillRequest): Promise<NormalizedMarketEvent[]> {
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "backfilling",
        notes: `${req.symbol}:${req.fromSequence}-${req.toSequence}`,
      })
    );
    const all = this.tradeLog.get(req.symbol.toUpperCase()) ?? [];
    const out = all.filter(
      (t) =>
        t.sequenceNumber >= req.fromSequence &&
        t.sequenceNumber <= req.toSequence
    );
    this.emit(
      buildConnectionHealth({
        provider: this.id,
        state: "connected",
        notes: `backfill_done:${out.length}`,
      })
    );
    return out;
  }

  getLastSubscribe(): SubscribeRequest | null {
    return this.lastSubscribe;
  }

  private emit(event: NormalizedMarketEvent): void {
    for (const l of this.listeners) l(event);
  }
}
