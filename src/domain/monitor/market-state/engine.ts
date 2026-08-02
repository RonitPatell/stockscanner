import type { NormalizedMarketEvent } from "../market-data/types.ts";
import { MemorySnapshotStore, type SnapshotStore } from "./snapshot-store.ts";
import { SymbolState } from "./symbol-state.ts";
import type {
  CompactSnapshot,
  EngineStats,
  SymbolMarketState,
  SymbolReference,
} from "./types.ts";
import { MONITOR_MARKET_STATE_VERSION } from "./version.ts";

export interface MarketStateEngineOptions {
  /** Concurrent symbol partitions (hash affinity). */
  partitions?: number;
  /** Hard cap on tracked symbols (LRU eviction). */
  maxSymbols?: number;
  /** Max ingest lag before event is counted dropped (ms). 0 = never drop for lag. */
  maxEventLagMs?: number;
  /** Snapshot flush interval (ms). */
  snapshotIntervalMs?: number;
  snapshotStore?: SnapshotStore;
  now?: () => number;
}

function hashSymbol(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) {
    h = (h * 31 + symbol.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * High-throughput rolling market-state engine.
 * - Partitioned by symbol hash (safe concurrent ownership per partition)
 * - Bounded memory via ring buffers + maxSymbols LRU
 * - No DB write per tick; periodic compact snapshots only
 */
export class MarketStateEngine {
  readonly version = MONITOR_MARKET_STATE_VERSION;
  private readonly partitions: Map<string, SymbolState>[];
  private readonly lru: string[] = [];
  private readonly lruIndex = new Map<string, number>();
  private readonly maxSymbols: number;
  private readonly maxEventLagMs: number;
  private readonly snapshotIntervalMs: number;
  private readonly store: SnapshotStore;
  private readonly nowFn: () => number;

  private eventsIn = 0;
  private eventsDropped = 0;
  private lagSum = 0;
  private lagMax = 0;
  private lagSamples = 0;
  private lastFlushMs = 0;
  private lastSnapshotAt = 0;

  constructor(opts: MarketStateEngineOptions = {}) {
    const n = Math.max(1, opts.partitions ?? 16);
    this.partitions = Array.from({ length: n }, () => new Map());
    this.maxSymbols = opts.maxSymbols ?? 10_000;
    this.maxEventLagMs = opts.maxEventLagMs ?? 0;
    this.snapshotIntervalMs = opts.snapshotIntervalMs ?? 5_000;
    this.store = opts.snapshotStore ?? new MemorySnapshotStore(this.maxSymbols);
    this.nowFn = opts.now ?? (() => Date.now());
    this.lastSnapshotAt = this.nowFn();
  }

  partitionCount(): number {
    return this.partitions.length;
  }

  partitionFor(symbol: string): number {
    return hashSymbol(symbol) % this.partitions.length;
  }

  setReference(symbol: string, ref: SymbolReference): void {
    const st = this.getOrCreate(symbol, this.nowFn());
    if (st) st.setReference(ref);
  }

  /**
   * Ingest one normalized market event. Returns false if dropped.
   */
  ingest(event: NormalizedMarketEvent): boolean {
    const now = this.nowFn();
    this.eventsIn += 1;

    if (
      event.type === "connection_health" ||
      event.type === "luld" ||
      event.type === "symbol_status"
    ) {
      return true; // acknowledged, not stateful here
    }

    const symbol = event.symbol?.toUpperCase();
    if (!symbol || symbol === "*") {
      this.eventsDropped += 1;
      return false;
    }

    const eventTs = eventTimeMs(event);
    if (eventTs != null) {
      const lag = Math.max(0, now - eventTs);
      this.lagSum += lag;
      this.lagSamples += 1;
      if (lag > this.lagMax) this.lagMax = lag;
      if (this.maxEventLagMs > 0 && lag > this.maxEventLagMs) {
        this.eventsDropped += 1;
        return false;
      }
    }

    const st = this.getOrCreate(symbol, now);
    if (!st) {
      this.eventsDropped += 1;
      return false;
    }

    switch (event.type) {
      case "trade":
        st.ingestTrade(event, now);
        break;
      case "nbbo_quote":
        st.ingestQuote(event, now);
        break;
      case "aggregate_1s":
      case "aggregate_1m":
        st.ingestAggregate(event, now);
        break;
      case "halt":
        st.ingestHalt(event, now);
        break;
      default:
        break;
    }

    if (now - this.lastSnapshotAt >= this.snapshotIntervalMs) {
      this.flushSnapshots(now);
    }
    return true;
  }

  /** Batch ingest for load tests / workers. */
  ingestMany(events: NormalizedMarketEvent[]): {
    accepted: number;
    dropped: number;
  } {
    let accepted = 0;
    let dropped = 0;
    for (const e of events) {
      if (this.ingest(e)) accepted += 1;
      else dropped += 1;
    }
    return { accepted, dropped };
  }

  getState(symbol: string, atMs?: number): SymbolMarketState | null {
    const st = this.partitions[this.partitionFor(symbol)]!.get(
      symbol.toUpperCase()
    );
    if (!st) return null;
    return st.snapshot(atMs ?? this.nowFn());
  }

  /** Flush compact snapshots for all tracked symbols (or dirty subset). */
  flushSnapshots(atMs?: number): number {
    const now = atMs ?? this.nowFn();
    const batch: CompactSnapshot[] = [];
    for (const part of this.partitions) {
      for (const [symbol, st] of part) {
        const state = st.snapshot(now);
        batch.push({
          version: MONITOR_MARKET_STATE_VERSION,
          symbol,
          asOfMs: now,
          state,
        });
      }
    }
    this.store.putMany(batch);
    this.lastFlushMs = now;
    this.lastSnapshotAt = now;
    return batch.length;
  }

  stats(): EngineStats {
    let symbols = 0;
    for (const p of this.partitions) symbols += p.size;
    return {
      eventsIn: this.eventsIn,
      eventsDropped: this.eventsDropped,
      symbolsTracked: symbols,
      lagMsMax: this.lagMax,
      lagMsAvg: this.lagSamples > 0 ? this.lagSum / this.lagSamples : 0,
      lastFlushMs: this.lastFlushMs,
      partitions: this.partitions.length,
    };
  }

  resetStats(): void {
    this.eventsIn = 0;
    this.eventsDropped = 0;
    this.lagSum = 0;
    this.lagMax = 0;
    this.lagSamples = 0;
  }

  snapshotStore(): SnapshotStore {
    return this.store;
  }

  private getOrCreate(symbol: string, now: number): SymbolState | null {
    const part = this.partitions[this.partitionFor(symbol)]!;
    let st = part.get(symbol);
    if (st) {
      this.touchLru(symbol);
      return st;
    }

    if (this.trackedCount() >= this.maxSymbols) {
      const evict = this.lru.shift();
      if (evict) {
        this.lruIndex.delete(evict);
        const ep = this.partitions[this.partitionFor(evict)]!;
        ep.delete(evict);
      } else {
        return null;
      }
    }

    st = new SymbolState(symbol);
    part.set(symbol, st);
    this.touchLru(symbol);
    st.lastTouchMs = now;
    return st;
  }

  private trackedCount(): number {
    let n = 0;
    for (const p of this.partitions) n += p.size;
    return n;
  }

  private touchLru(symbol: string): void {
    const idx = this.lruIndex.get(symbol);
    if (idx != null) {
      // Cheap approximate LRU: move mark to end without full splice on every hit.
      // Full reorder every 64 touches per symbol path via append + lazy compaction.
      this.lru.push(symbol);
      this.lruIndex.set(symbol, this.lru.length - 1);
      if (this.lru.length > this.maxSymbols * 2) this.compactLru();
      return;
    }
    this.lru.push(symbol);
    this.lruIndex.set(symbol, this.lru.length - 1);
  }

  private compactLru(): void {
    const seen = new Set<string>();
    const next: string[] = [];
    for (let i = this.lru.length - 1; i >= 0; i--) {
      const s = this.lru[i]!;
      if (seen.has(s)) continue;
      if (!this.partitions[this.partitionFor(s)]!.has(s)) continue;
      seen.add(s);
      next.push(s);
    }
    next.reverse();
    this.lru.length = 0;
    this.lruIndex.clear();
    for (const s of next) {
      this.lruIndex.set(s, this.lru.length);
      this.lru.push(s);
    }
  }
}

function eventTimeMs(event: NormalizedMarketEvent): number | null {
  let iso: string | undefined;
  switch (event.type) {
    case "trade":
      iso = event.sipTimestamp || event.participantTimestamp;
      break;
    case "nbbo_quote":
      iso = event.sipTimestamp;
      break;
    case "aggregate_1s":
    case "aggregate_1m":
      iso = event.windowEnd || event.windowStart;
      break;
    case "halt":
      iso = event.eventAt;
      break;
    default:
      iso = event.trustTickerReceivedAt;
  }
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}
