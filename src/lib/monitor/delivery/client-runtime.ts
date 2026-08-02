/**
 * Browser Monitor delivery runtime helpers (pure — no React).
 * Batched apply, bounded queues, Last-Event-ID resume, dedupe.
 */

import {
  BoundedOutboundQueue,
  dedupeBySequence,
  type DeliveryHealth,
  type MonitorLadderSnapshot,
  type MonitorStreamMessage,
  type MonitorSymbolDelta,
  type QueuedDelivery,
} from "../../../domain/monitor/delivery/index.ts";

export const MONITOR_SSE_LAST_ID_KEY = "tt-monitor-sse-last-event-id";
export const DEFAULT_FRAME_BUDGET_MS = 16; // ~60fps; callers may use 32 for 30fps

export interface ClientDeliveryState {
  health: DeliveryHealth;
  lastSequence: number;
  snapshot: MonitorLadderSnapshot | null;
  symbols: Map<string, MonitorSymbolDelta>;
  lastEventAtMs: number | null;
  notes: string[];
}

export function createClientDeliveryState(): ClientDeliveryState {
  return {
    health: "disconnected",
    lastSequence: 0,
    snapshot: null,
    symbols: new Map(),
    lastEventAtMs: null,
    notes: [],
  };
}

export class MonitorClientRuntime {
  readonly queue: BoundedOutboundQueue;
  readonly seenSequences = new Set<number>();
  private state: ClientDeliveryState;
  private readonly frameBudgetMs: number;
  private lastApplyMs = 0;

  constructor(opts?: { maxQueue?: number; frameBudgetMs?: number }) {
    this.queue = new BoundedOutboundQueue(opts?.maxQueue ?? 128);
    this.frameBudgetMs = opts?.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
    this.state = createClientDeliveryState();
  }

  getState(): ClientDeliveryState {
    return this.state;
  }

  lastEventId(): string | null {
    return this.state.lastSequence > 0 ? String(this.state.lastSequence) : null;
  }

  /** Enqueue a server message; visual obsolescence handled by queue. */
  accept(message: MonitorStreamMessage, nowMs = Date.now()): void {
    // entitlement_revoked has no sequence — drop here (auth gate handles logout).
    if (!("sequence" in message)) return;
    if (this.seenSequences.has(message.sequence)) return;
    const priority =
      message.type === "delta"
        ? message.priority
        : message.type === "health"
          ? "critical"
          : "state";
    this.queue.enqueue({
      sequence: message.sequence,
      priority,
      message,
      enqueuedAtMs: nowMs,
    });
  }

  /**
   * Apply up to maxMessages if frame budget allows.
   * When document is hidden, only critical/state drain (no visual spam).
   */
  applyFrame(opts: {
    nowMs: number;
    documentVisible: boolean;
    maxMessages?: number;
  }): { applied: number; state: ClientDeliveryState } {
    if (
      opts.documentVisible &&
      opts.nowMs - this.lastApplyMs < this.frameBudgetMs &&
      this.lastApplyMs > 0
    ) {
      return { applied: 0, state: this.state };
    }

    const max = opts.maxMessages ?? (opts.documentVisible ? 32 : 8);
    const batch = this.queue.drain(max * 2);
    const filtered = opts.documentVisible
      ? batch
      : batch.filter((q) => q.priority !== "visual");
    const deduped = dedupeBySequence(
      filtered.map((q) => q.message).filter((m) => "sequence" in m) as Array<
        MonitorStreamMessage & { sequence: number }
      >,
      this.seenSequences
    );

    let applied = 0;
    for (const msg of deduped.slice(0, max)) {
      this.applyMessage(msg, opts.nowMs);
      applied += 1;
    }
    // Re-queue leftovers that weren't applied
    const appliedSeq = new Set(deduped.slice(0, max).map((m) => m.sequence));
    for (const q of batch) {
      if ("sequence" in q.message && !appliedSeq.has(q.message.sequence)) {
        if (!opts.documentVisible && q.priority === "visual") continue;
        this.queue.enqueue(q);
      }
    }

    this.lastApplyMs = opts.nowMs;
    return { applied, state: this.state };
  }

  /** After long background — force snapshot semantics and clear visual backlog. */
  onVisibilityRestored(snapshot: MonitorLadderSnapshot | null, nowMs: number): void {
    // Drop obsolete visuals waiting in queue
    const kept: QueuedDelivery[] = [];
    for (const q of this.queue.drain(10_000)) {
      if (q.priority === "critical" || q.priority === "state") kept.push(q);
    }
    this.queue.clear();
    for (const q of kept) this.queue.enqueue(q);
    if (snapshot) {
      this.applyMessage(
        {
          type: "snapshot",
          id: String(snapshot.sequence),
          sequence: snapshot.sequence,
          payload: snapshot,
        },
        nowMs
      );
    }
    this.state.notes = [
      ...this.state.notes.filter((n) => !n.startsWith("Tab hidden")),
      "Tab restored — snapshot refresh",
    ].slice(-6);
  }

  private applyMessage(msg: MonitorStreamMessage, nowMs: number): void {
    if ("sequence" in msg) {
      this.state.lastSequence = Math.max(this.state.lastSequence, msg.sequence);
      this.state.lastEventAtMs = nowMs;
    }
    switch (msg.type) {
      case "snapshot": {
        this.state.snapshot = msg.payload;
        this.state.health = msg.payload.health;
        this.state.symbols.clear();
        for (const s of msg.payload.symbols) {
          this.state.symbols.set(s.symbol, s);
        }
        this.state.notes = msg.payload.dataNotes.slice(0, 6);
        break;
      }
      case "delta": {
        for (const d of msg.payload) {
          const prev = this.state.symbols.get(d.symbol);
          if (prev && d.sequence <= prev.sequence) continue;
          this.state.symbols.set(d.symbol, d);
        }
        break;
      }
      case "health": {
        this.state.health = msg.health;
        this.state.notes = [msg.reason, ...this.state.notes].slice(0, 6);
        break;
      }
      case "heartbeat": {
        this.state.health = msg.health;
        break;
      }
      case "entitlement_revoked": {
        this.state.health = "disconnected";
        this.state.notes = ["Pro entitlement revoked", ...this.state.notes].slice(0, 6);
        break;
      }
      default:
        break;
    }

    // Never continue showing stale as live
    if (this.state.health === "stale" || this.state.health === "degraded") {
      for (const [sym, d] of this.state.symbols) {
        if (d.stale || d.dataAvailability === "stale") {
          this.state.symbols.set(sym, {
            ...d,
            stale: true,
            dataAvailability: "stale",
          });
        }
      }
    }
  }
}

export function connectionFromHealth(
  health: DeliveryHealth
): "live" | "degraded" | "disconnected" | "delayed" {
  switch (health) {
    case "live":
      return "live";
    case "degraded":
    case "recovering":
      return "degraded";
    case "stale":
      return "delayed";
    default:
      return "disconnected";
  }
}
