/**
 * Bounded outbound queue for client fanout / browser apply.
 * Drop obsolete visual updates before critical events.
 */

import type { DeliveryPriority, MonitorStreamMessage } from "./types.ts";

const PRIORITY_RANK: Record<DeliveryPriority, number> = {
  critical: 0,
  state: 1,
  visual: 2,
};

export interface QueuedDelivery {
  sequence: number;
  priority: DeliveryPriority;
  message: MonitorStreamMessage;
  enqueuedAtMs: number;
}

export interface OutboundQueueStats {
  depth: number;
  droppedObsoleteVisual: number;
  droppedCapacity: number;
}

export class BoundedOutboundQueue {
  private readonly max: number;
  private readonly items: QueuedDelivery[] = [];
  private droppedObsoleteVisual = 0;
  private droppedCapacity = 0;
  /** Latest visual sequence per symbol — used to drop superseded visuals */
  private latestVisualBySymbol = new Map<string, number>();

  constructor(maxDepth = 256) {
    this.max = Math.max(8, maxDepth);
  }

  get depth(): number {
    return this.items.length;
  }

  stats(): OutboundQueueStats {
    return {
      depth: this.items.length,
      droppedObsoleteVisual: this.droppedObsoleteVisual,
      droppedCapacity: this.droppedCapacity,
    };
  }

  clear(): void {
    this.items.length = 0;
    this.latestVisualBySymbol.clear();
  }

  enqueue(item: QueuedDelivery): boolean {
    if (item.priority === "visual" && item.message.type === "delta") {
      for (const d of item.message.payload) {
        const prev = this.latestVisualBySymbol.get(d.symbol);
        if (prev != null && d.sequence <= prev) {
          this.droppedObsoleteVisual += 1;
          return false;
        }
        this.latestVisualBySymbol.set(d.symbol, d.sequence);
      }
      // Remove older visual deltas for same symbols still in queue
      for (let i = this.items.length - 1; i >= 0; i--) {
        const q = this.items[i]!;
        if (q.priority !== "visual" || q.message.type !== "delta") continue;
        const superseded = q.message.payload.every((d) => {
          const latest = this.latestVisualBySymbol.get(d.symbol);
          return latest != null && d.sequence < latest;
        });
        if (superseded) {
          this.items.splice(i, 1);
          this.droppedObsoleteVisual += 1;
        }
      }
    }

    this.items.push(item);
    this.items.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.sequence - b.sequence
    );

    while (this.items.length > this.max) {
      // Drop lowest priority from the end (visual first)
      let dropIdx = -1;
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (this.items[i]!.priority === "visual") {
          dropIdx = i;
          break;
        }
      }
      if (dropIdx < 0) dropIdx = this.items.length - 1;
      const dropped = this.items.splice(dropIdx, 1)[0];
      if (dropped?.priority === "visual") this.droppedObsoleteVisual += 1;
      else this.droppedCapacity += 1;
    }
    return true;
  }

  /** Drain up to n messages (already priority-sorted). */
  drain(n: number): QueuedDelivery[] {
    return this.items.splice(0, Math.max(0, n));
  }

  peekAll(): readonly QueuedDelivery[] {
    return this.items;
  }
}

export function priorityForDelta(
  deltas: { criticalEvent: boolean; halted: boolean; stale: boolean }[]
): DeliveryPriority {
  if (deltas.some((d) => d.criticalEvent || d.halted)) return "critical";
  if (deltas.some((d) => d.stale)) return "state";
  return "visual";
}
