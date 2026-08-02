import type { SessionSegment } from "../market-state/session.ts";
import type {
  SymbolMarketState,
  SymbolReference,
} from "../market-state/types.ts";
import {
  MarketActivityBaseline,
  SymbolBaseline,
  sampleFromFeatures,
} from "./baseline.ts";
import { resolveSessionConfig } from "./config.ts";
import { extractFeatures } from "./features.ts";
import { scoreMomentum } from "./score.ts";
import {
  MemoryMomentumSnapshotStore,
  type MomentumSnapshotStore,
} from "./snapshot-store.ts";
import type {
  MomentumEngineOptions,
  MomentumResult,
  MomentumSnapshot,
  SessionMomentumConfig,
} from "./types.ts";
import { MONITOR_MOMENTUM_VERSION } from "./version.ts";

/**
 * Momentum Engine V1 — pure, deterministic, explainable.
 * Does not produce trade recommendations.
 *
 * Snapshots persist only at a controlled cadence (snapshotIntervalMs).
 */
export class MomentumEngine {
  readonly version = MONITOR_MOMENTUM_VERSION;
  private readonly baselines = new Map<string, SymbolBaseline>();
  private readonly market = new MarketActivityBaseline();
  private readonly refs = new Map<string, SymbolReference>();
  private readonly pendingResults = new Map<string, MomentumResult>();
  private readonly store: MomentumSnapshotStore;
  private readonly snapshotIntervalMs: number;
  private readonly baselineCapacity: number;
  private readonly sessionOverrides?: MomentumEngineOptions["sessionConfigs"];
  private readonly nowFn: () => number;
  private lastSnapshotAt = 0;
  private evaluations = 0;
  private snapshotsFlushed = 0;

  constructor(opts: MomentumEngineOptions = {}) {
    this.snapshotIntervalMs = opts.snapshotIntervalMs ?? 5_000;
    this.baselineCapacity = opts.baselineCapacity ?? 64;
    this.sessionOverrides = opts.sessionConfigs;
    this.store =
      (opts.snapshotStore as MomentumSnapshotStore | undefined) ??
      new MemoryMomentumSnapshotStore();
    this.nowFn = opts.now ?? (() => Date.now());
    this.lastSnapshotAt = this.nowFn();
  }

  setReference(symbol: string, ref: SymbolReference): void {
    this.refs.set(symbol.toUpperCase(), ref);
  }

  sessionConfig(segment: SessionSegment): SessionMomentumConfig {
    return resolveSessionConfig(segment, this.sessionOverrides);
  }

  /**
   * Evaluate momentum from a rolling market-state snapshot.
   * Updates symbol + market baselines. Flushes compact snapshots on cadence.
   */
  evaluate(state: SymbolMarketState): MomentumResult {
    const now = this.nowFn();
    const symbol = state.symbol.toUpperCase();
    const ref = this.refs.get(symbol) ?? null;
    const features = extractFeatures(state, ref);
    features.symbol = symbol;

    let baseline = this.baselines.get(symbol);
    if (!baseline) {
      baseline = new SymbolBaseline(this.baselineCapacity);
      this.baselines.set(symbol, baseline);
    }

    this.market.observe(features);

    const config = resolveSessionConfig(features.session, this.sessionOverrides);
    const result = scoreMomentum({
      features,
      baseline,
      market: this.market.snapshot(),
      config,
      calculatedAtMs: now,
    });

    // Push AFTER scoring so the current point is not in its own baseline.
    baseline.push(sampleFromFeatures(features));
    this.pendingResults.set(symbol, result);
    this.evaluations += 1;

    if (now - this.lastSnapshotAt >= this.snapshotIntervalMs) {
      this.flushSnapshots(now);
    }

    return result;
  }

  flushSnapshots(atMs?: number): number {
    const now = atMs ?? this.nowFn();
    const batch: MomentumSnapshot[] = [];
    for (const [symbol, result] of this.pendingResults) {
      batch.push({
        version: MONITOR_MOMENTUM_VERSION,
        symbol,
        asOfMs: now,
        result,
      });
    }
    if (batch.length > 0) {
      this.store.putMany(batch);
      this.snapshotsFlushed += batch.length;
    }
    this.pendingResults.clear();
    this.market.reset();
    this.lastSnapshotAt = now;
    return batch.length;
  }

  getSnapshot(symbol: string): MomentumSnapshot | null {
    const s = this.store.get(symbol);
    if (s instanceof Promise) return null;
    return s;
  }

  stats(): {
    evaluations: number;
    snapshotsFlushed: number;
    symbolsBaselines: number;
    version: string;
  } {
    return {
      evaluations: this.evaluations,
      snapshotsFlushed: this.snapshotsFlushed,
      symbolsBaselines: this.baselines.size,
      version: this.version,
    };
  }

  snapshotStore(): MomentumSnapshotStore {
    return this.store;
  }
}

/** Single-shot score without engine persistence (fixtures / pure calls). */
export function scoreFromMarketState(
  state: SymbolMarketState,
  opts?: {
    ref?: SymbolReference | null;
    baseline?: SymbolBaseline;
    market?: ReturnType<MarketActivityBaseline["snapshot"]>;
    config?: SessionMomentumConfig;
    nowMs?: number;
  }
): MomentumResult {
  const features = extractFeatures(state, opts?.ref ?? null);
  const baseline = opts?.baseline ?? new SymbolBaseline(64);
  const market = opts?.market ?? {
    medianTradeRate: null,
    medianDollarVel: null,
    sampleCount: 0,
    reliable: false,
  };
  const config = opts?.config ?? resolveSessionConfig(features.session);
  return scoreMomentum({
    features,
    baseline,
    market,
    config,
    calculatedAtMs: opts?.nowMs ?? state.asOfMs,
  });
}
