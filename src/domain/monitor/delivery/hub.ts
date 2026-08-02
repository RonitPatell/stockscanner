/**
 * Server-side Monitor Delivery Hub.
 * Owns calculations / ranking aggregation for fanout — browsers receive snapshots/deltas only.
 */

import {
  circuitAllows,
  circuitFailure,
  circuitSuccess,
  createCircuit,
  type CircuitConfig,
} from "./circuit.ts";
import {
  BoundedOutboundQueue,
  priorityForDelta,
} from "./outbound-queue.ts";
import { MONITOR_DELIVERY_VERSION } from "./version.ts";
import type {
  DeliveryHealth,
  DeliveryMetrics,
  MonitorLadderSnapshot,
  MonitorStreamMessage,
  MonitorSymbolDelta,
  NormalizedMarketEvent,
} from "./types.ts";

export interface DeliveryHubConfig {
  maxTrackedSymbols: number;
  maxLadderSize: number;
  maxInboundQueue: number;
  maxOutboundQueue: number;
  maxEventLagMs: number;
  staleAfterMs: number;
  snapshotEveryNEvents: number;
  sourceCircuit: CircuitConfig;
  processingCircuit: CircuitConfig;
}

export const DEFAULT_DELIVERY_HUB_CONFIG: DeliveryHubConfig = {
  maxTrackedSymbols: 10_000,
  maxLadderSize: 64,
  maxInboundQueue: 20_000,
  maxOutboundQueue: 2_048,
  maxEventLagMs: 30_000,
  staleAfterMs: 8_000,
  snapshotEveryNEvents: 500,
  sourceCircuit: { failureThreshold: 5, coolDownMs: 15_000 },
  processingCircuit: { failureThreshold: 8, coolDownMs: 10_000 },
};

interface SymbolSlot {
  symbol: string;
  sequence: number;
  asOfMs: number;
  price: number | null;
  changePercent: number | null;
  relativeVolume: number | null;
  tradesPerSecond: number | null;
  halted: boolean;
  criticalEvent: boolean;
  momentumState: string | null;
  momentumIntensity: number | null;
  attentionPriority: number | null;
  direction: "up" | "down" | "neutral" | null;
  availability: MonitorSymbolDelta["dataAvailability"];
  lastTouchMs: number;
}

export interface DeliveryCheckpoint {
  schemaVersion: string;
  sequence: number;
  savedAtMs: number;
  health: DeliveryHealth;
  symbols: SymbolSlot[];
}

/**
 * In-process hub: ingest → rank → publish ring for SSE resume.
 */
export class MonitorDeliveryHub {
  readonly config: DeliveryHubConfig;
  private sequence = 0;
  private symbols = new Map<string, SymbolSlot>();
  private lru: string[] = [];
  private inbound: NormalizedMarketEvent[] = [];
  private readonly outbound: BoundedOutboundQueue;
  private readonly published = new Map<number, MonitorStreamMessage>();
  private readonly maxRing: number;
  private sourceCircuit = createCircuit();
  private processingCircuit = createCircuit();
  private health: DeliveryHealth = "live";
  private eventsIn = 0;
  private eventsDroppedSource = 0;
  private eventsDroppedLag = 0;
  private eventsDroppedBackpressure = 0;
  private lagSum = 0;
  private lagSamples = 0;
  private lagMax = 0;
  private publishedSnapshots = 0;
  private publishedDeltas = 0;
  private clientAcks = 0;
  private lastPublishMs = 0;
  private eventsSinceSnapshot = 0;
  private nowFn: () => number;

  constructor(
    config: Partial<DeliveryHubConfig> = {},
    opts?: { nowFn?: () => number; maxRing?: number }
  ) {
    this.config = { ...DEFAULT_DELIVERY_HUB_CONFIG, ...config };
    this.outbound = new BoundedOutboundQueue(this.config.maxOutboundQueue);
    this.maxRing = opts?.maxRing ?? 4_096;
    this.nowFn = opts?.nowFn ?? Date.now;
  }

  /** Persistable checkpoint for worker recovery. */
  exportCheckpoint(): DeliveryCheckpoint {
    return {
      schemaVersion: MONITOR_DELIVERY_VERSION,
      sequence: this.sequence,
      savedAtMs: this.nowFn(),
      health: this.health,
      symbols: [...this.symbols.values()],
    };
  }

  restoreCheckpoint(cp: DeliveryCheckpoint): void {
    this.sequence = cp.sequence;
    this.health = cp.health;
    this.symbols.clear();
    this.lru = [];
    for (const s of cp.symbols.slice(0, this.config.maxTrackedSymbols)) {
      this.symbols.set(s.symbol, { ...s });
      this.lru.push(s.symbol);
    }
    this.health = "recovering";
    this.publishHealth("checkpoint_restored");
  }

  metrics(): DeliveryMetrics {
    const oq = this.outbound.stats();
    return {
      eventsIn: this.eventsIn,
      eventsDroppedSource: this.eventsDroppedSource,
      eventsDroppedLag: this.eventsDroppedLag,
      eventsDroppedBackpressure: this.eventsDroppedBackpressure,
      eventsDroppedObsoleteVisual: oq.droppedObsoleteVisual,
      publishedSnapshots: this.publishedSnapshots,
      publishedDeltas: this.publishedDeltas,
      lagMsAvg: this.lagSamples > 0 ? this.lagSum / this.lagSamples : 0,
      lagMsMax: this.lagMax,
      inboundQueueDepth: this.inbound.length,
      outboundQueueDepth: oq.depth,
      clientAcks: this.clientAcks,
      circuitSource: this.sourceCircuit.state,
      circuitProcessing: this.processingCircuit.state,
      trackedSymbols: this.symbols.size,
      lastPublishMs: this.lastPublishMs,
      health: this.health,
    };
  }

  acknowledge(sequence: number): void {
    if (Number.isFinite(sequence) && sequence > 0) {
      this.clientAcks += 1;
    }
  }

  /** Source backpressure: enqueue inbound; drop oldest non-critical if full. */
  offerSourceEvents(events: NormalizedMarketEvent[]): number {
    const now = this.nowFn();
    const src = circuitAllows(this.sourceCircuit, now);
    if (!src.allow) {
      this.eventsDroppedSource += events.length;
      this.health = "degraded";
      return 0;
    }

    let accepted = 0;
    for (const ev of events) {
      this.eventsIn += 1;
      const lag = Math.max(0, now - (ev.observedAtMs || ev.ingestedAtMs));
      this.lagSum += lag;
      this.lagSamples += 1;
      this.lagMax = Math.max(this.lagMax, lag);
      if (lag > this.config.maxEventLagMs) {
        this.eventsDroppedLag += 1;
        continue;
      }
      if (this.inbound.length >= this.config.maxInboundQueue) {
        // Drop from front unless critical
        const head = this.inbound[0];
        if (head && !(head.criticalEvent || head.halted)) {
          this.inbound.shift();
          this.eventsDroppedBackpressure += 1;
        } else {
          this.eventsDroppedBackpressure += 1;
          continue;
        }
      }
      this.inbound.push(ev);
      accepted += 1;
    }
    if (accepted > 0) circuitSuccess(this.sourceCircuit);
    return accepted;
  }

  /** Process inbound queue with processing circuit + publish deltas/snapshots. */
  process(maxBatch = 2_000): number {
    const now = this.nowFn();
    const proc = circuitAllows(this.processingCircuit, now);
    if (!proc.allow) {
      this.health = "degraded";
      this.publishHealth("processing_circuit_open");
      return 0;
    }

    let n = 0;
    const dirty = new Set<string>();
    try {
      while (n < maxBatch && this.inbound.length > 0) {
        const ev = this.inbound.shift()!;
        this.applyEvent(ev, now);
        dirty.add(ev.symbol.toUpperCase());
        n += 1;
        this.eventsSinceSnapshot += 1;
      }
      if (dirty.size > 0) {
        this.publishDelta([...dirty], now);
        circuitSuccess(this.processingCircuit);
      }
      if (
        this.eventsSinceSnapshot >= this.config.snapshotEveryNEvents ||
        (dirty.size > 0 && this.publishedSnapshots === 0)
      ) {
        this.publishSnapshot(now);
        this.eventsSinceSnapshot = 0;
      }
      this.refreshHealth(now);
    } catch {
      circuitFailure(this.processingCircuit, this.config.processingCircuit, now);
      this.health = "degraded";
      this.publishHealth("processing_failure");
    }
    return n;
  }

  /** Simulate source disconnect / Redis restart style failure. */
  tripSourceCircuit(nowMs?: number): void {
    const now = nowMs ?? this.nowFn();
    // Force open (provider hard disconnect) — not a single soft failure.
    this.sourceCircuit.state = "open";
    this.sourceCircuit.consecutiveFailures = this.config.sourceCircuit.failureThreshold;
    this.sourceCircuit.openedAt = now;
    this.sourceCircuit.nextEligibleAt = now + this.config.sourceCircuit.coolDownMs;
    this.health = "degraded";
    this.publishHealth("source_disconnect");
  }

  clearSourceCircuit(): void {
    circuitSuccess(this.sourceCircuit);
    this.refreshHealth(this.nowFn());
  }

  /** Fanout messages with sequence > afterSequence (Last-Event-ID resume). */
  messagesAfter(afterSequence: number, limit = 256): MonitorStreamMessage[] {
    const out: MonitorStreamMessage[] = [];
    const keys = [...this.published.keys()].filter((k) => k > afterSequence).sort((a, b) => a - b);
    for (const k of keys) {
      const m = this.published.get(k);
      if (m) out.push(m);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Current hub publish sequence (monotonic event id space). */
  currentSequence(): number {
    return this.sequence;
  }

  /** Sequences retained in the resume ring (for gap planning). */
  ringSequences(): number[] {
    return [...this.published.keys()];
  }

  /**
   * Gap-aware resume plan. Prefer replay; fall back to full snapshot when the
   * ring cannot safely cover (afterEventId, hubSequence].
   */
  planResume(
    afterEventId: number,
    limit = 256
  ): {
    mode: "replay" | "full_snapshot";
    reason: string;
    messages: MonitorStreamMessage[];
    oldestInRing: number | null;
    newestInRing: number | null;
  } {
    // Lazy import avoided — keep hub self-contained with inline plan.
    const after = Math.max(0, Math.floor(afterEventId));
    const hubSeq = this.sequence;
    const sorted = [...this.published.keys()].sort((a, b) => a - b);
    const oldestInRing = sorted.length ? sorted[0]! : null;
    const newestInRing = sorted.length ? sorted[sorted.length - 1]! : null;

    if (after >= hubSeq) {
      return {
        mode: "replay",
        reason: "none",
        messages: [],
        oldestInRing,
        newestInRing,
      };
    }

    if (sorted.length === 0 && hubSeq > after) {
      return {
        mode: "full_snapshot",
        reason: "worker_restart",
        messages: [],
        oldestInRing,
        newestInRing,
      };
    }

    if (oldestInRing != null && after + 1 < oldestInRing) {
      return {
        mode: "full_snapshot",
        reason: "ring_truncated",
        messages: [],
        oldestInRing,
        newestInRing,
      };
    }

    const ringSet = new Set(sorted);
    for (let s = after + 1; s <= hubSeq; s++) {
      if (!ringSet.has(s)) {
        return {
          mode: "full_snapshot",
          reason: "sequence_hole",
          messages: [],
          oldestInRing,
          newestInRing,
        };
      }
    }

    return {
      mode: "replay",
      reason: "none",
      messages: this.messagesAfter(after, limit),
      oldestInRing,
      newestInRing,
    };
  }

  latestSnapshot(): MonitorLadderSnapshot {
    return this.buildSnapshot(this.nowFn());
  }

  /** Drain outbound for a single client/session apply path (tests / local). */
  drainOutbound(n: number) {
    return this.outbound.drain(n);
  }

  private applyEvent(ev: NormalizedMarketEvent, now: number): void {
    const symbol = ev.symbol.toUpperCase();
    this.touchLru(symbol);
    const prev = this.symbols.get(symbol);
    const asOf = ev.observedAtMs || ev.ingestedAtMs || now;
    const availability = ev.availability ?? (ev.price == null ? "unavailable" : "ok");
    const slot: SymbolSlot = {
      symbol,
      sequence: (prev?.sequence ?? 0) + 1,
      asOfMs: asOf,
      price: ev.price ?? prev?.price ?? null,
      changePercent: ev.changePercent ?? prev?.changePercent ?? null,
      relativeVolume: ev.relativeVolume ?? prev?.relativeVolume ?? null,
      tradesPerSecond: ev.tradesPerSecond ?? prev?.tradesPerSecond ?? null,
      halted: Boolean(ev.halted ?? prev?.halted),
      criticalEvent: Boolean(ev.criticalEvent ?? false),
      momentumState: ev.momentumState ?? prev?.momentumState ?? null,
      momentumIntensity:
        ev.momentumIntensity ?? prev?.momentumIntensity ?? null,
      attentionPriority: this.deriveAttention(ev, prev),
      direction: ev.direction ?? prev?.direction ?? null,
      availability,
      lastTouchMs: now,
    };
    this.symbols.set(symbol, slot);
    this.trimSymbols();
  }

  private deriveAttention(
    ev: NormalizedMarketEvent,
    prev: SymbolSlot | undefined
  ): number {
    if (ev.attentionPriority != null) return ev.attentionPriority;
    const intensity = ev.momentumIntensity ?? prev?.momentumIntensity ?? 0;
    const rvol = ev.relativeVolume ?? prev?.relativeVolume ?? 1;
    const haltBoost = ev.halted ? 40 : 0;
    const critBoost = ev.criticalEvent ? 50 : 0;
    return Math.min(100, intensity * 40 + Math.min(rvol, 10) * 4 + haltBoost + critBoost);
  }

  private touchLru(symbol: string): void {
    const i = this.lru.indexOf(symbol);
    if (i >= 0) this.lru.splice(i, 1);
    this.lru.push(symbol);
  }

  private trimSymbols(): void {
    while (this.symbols.size > this.config.maxTrackedSymbols && this.lru.length) {
      const oldest = this.lru.shift()!;
      this.symbols.delete(oldest);
    }
  }

  private toDelta(slot: SymbolSlot, now: number): MonitorSymbolDelta {
    const age = now - slot.asOfMs;
    const stale = age > this.config.staleAfterMs || slot.availability === "stale";
    return {
      symbol: slot.symbol,
      sequence: slot.sequence,
      asOfMs: slot.asOfMs,
      rank: null, // filled in snapshot/delta batch
      attentionPriority: slot.attentionPriority,
      momentumState: slot.momentumState,
      momentumIntensity: slot.momentumIntensity,
      direction: slot.direction,
      halted: slot.halted,
      criticalEvent: slot.criticalEvent,
      dataAvailability: stale ? "stale" : slot.availability,
      stale,
    };
  }

  private ranked(now: number): MonitorSymbolDelta[] {
    const all = [...this.symbols.values()].map((s) => this.toDelta(s, now));
    all.sort(
      (a, b) =>
        (b.attentionPriority ?? 0) - (a.attentionPriority ?? 0) ||
        a.symbol.localeCompare(b.symbol)
    );
    return all.slice(0, this.config.maxLadderSize).map((d, i) => ({
      ...d,
      rank: i + 1,
    }));
  }

  private buildSnapshot(now: number): MonitorLadderSnapshot {
    const symbols = this.ranked(now);
    return {
      schemaVersion: MONITOR_DELIVERY_VERSION,
      sequence: this.sequence,
      publishedAtMs: now,
      health: this.health,
      symbols,
      trackedSymbolCount: this.symbols.size,
      leaderSymbol: symbols[0]?.symbol ?? null,
      dataNotes: this.notes(),
    };
  }

  private notes(): string[] {
    const m = this.metrics();
    const notes: string[] = [];
    if (m.circuitSource === "open") notes.push("Source circuit open");
    if (m.circuitProcessing === "open") notes.push("Processing circuit open");
    if (this.health === "stale") notes.push("Data marked stale — not live");
    if (this.health === "degraded") notes.push("Degraded delivery");
    if (this.health === "recovering") notes.push("Recovering from checkpoint");
    return notes;
  }

  private publishDelta(symbols: string[], now: number): void {
    const deltas: MonitorSymbolDelta[] = [];
    const ranked = this.ranked(now);
    const rankBy = new Map(ranked.map((d) => [d.symbol, d.rank]));
    for (const sym of symbols) {
      const slot = this.symbols.get(sym);
      if (!slot) continue;
      const d = this.toDelta(slot, now);
      d.rank = rankBy.get(sym) ?? null;
      deltas.push(d);
    }
    if (!deltas.length) return;
    this.sequence += 1;
    const priority = priorityForDelta(deltas);
    const msg: MonitorStreamMessage = {
      type: "delta",
      id: String(this.sequence),
      sequence: this.sequence,
      priority,
      payload: deltas,
    };
    this.remember(msg);
    this.outbound.enqueue({
      sequence: this.sequence,
      priority,
      message: msg,
      enqueuedAtMs: now,
    });
    this.publishedDeltas += 1;
    this.lastPublishMs = now;
  }

  private publishSnapshot(now: number): void {
    this.sequence += 1;
    const payload = this.buildSnapshot(now);
    payload.sequence = this.sequence;
    const msg: MonitorStreamMessage = {
      type: "snapshot",
      id: String(this.sequence),
      sequence: this.sequence,
      payload,
    };
    this.remember(msg);
    this.outbound.enqueue({
      sequence: this.sequence,
      priority: "state",
      message: msg,
      enqueuedAtMs: now,
    });
    this.publishedSnapshots += 1;
    this.lastPublishMs = now;
    if (this.health === "recovering") this.health = "live";
  }

  private publishHealth(reason: string): void {
    const now = this.nowFn();
    this.sequence += 1;
    const msg: MonitorStreamMessage = {
      type: "health",
      id: String(this.sequence),
      sequence: this.sequence,
      health: this.health,
      reason,
      publishedAtMs: now,
    };
    this.remember(msg);
    this.outbound.enqueue({
      sequence: this.sequence,
      priority: "critical",
      message: msg,
      enqueuedAtMs: now,
    });
    this.lastPublishMs = now;
  }

  private remember(msg: MonitorStreamMessage): void {
    if (!("sequence" in msg)) return;
    this.published.set(msg.sequence, msg);
    while (this.published.size > this.maxRing) {
      const min = Math.min(...this.published.keys());
      this.published.delete(min);
    }
  }

  private refreshHealth(now: number): void {
    if (this.sourceCircuit.state === "open" || this.processingCircuit.state === "open") {
      this.health = "degraded";
      return;
    }
    if (this.symbols.size === 0) {
      this.health = "live";
      return;
    }
    let staleCount = 0;
    for (const s of this.symbols.values()) {
      if (now - s.asOfMs > this.config.staleAfterMs) staleCount += 1;
    }
    const ratio = staleCount / this.symbols.size;
    if (ratio > 0.5) this.health = "stale";
    else if (ratio > 0.15) this.health = "degraded";
    else if (this.health !== "recovering") this.health = "live";
  }
}

/** Deduplicate stream messages by sequence (client / resume). */
export function dedupeBySequence<T extends { sequence: number }>(
  messages: T[],
  seen: Set<number>
): T[] {
  const out: T[] = [];
  for (const m of messages) {
    if (seen.has(m.sequence)) continue;
    seen.add(m.sequence);
    out.push(m);
  }
  return out;
}
