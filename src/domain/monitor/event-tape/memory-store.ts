import { EVENT_TAPE_CONFIG } from "./config.ts";
import type { EventTapeStorePort, MonitorTapeItem } from "./types.ts";

/**
 * In-process retention store with max-items + wall-clock pruning.
 * Adapters (Redis) implement the same port for durable history.
 */
export class MemoryEventTapeStore implements EventTapeStorePort {
  private items: MonitorTapeItem[] = [];
  private readonly maxItems: number;
  private readonly retentionMs: number;

  constructor(opts?: { maxItems?: number; retentionMs?: number }) {
    this.maxItems = opts?.maxItems ?? EVENT_TAPE_CONFIG.retentionMaxItems;
    this.retentionMs = opts?.retentionMs ?? EVENT_TAPE_CONFIG.retentionMs;
  }

  appendSync(items: MonitorTapeItem[]): void {
    if (!items.length) return;
    // Newest at front (matches Redis LPUSH convention).
    this.items.unshift(...[...items].reverse());
    this.prune(Date.now());
  }

  async append(items: MonitorTapeItem[]): Promise<void> {
    this.appendSync(items);
  }

  listSync(opts?: {
    sinceMs?: number;
    limit?: number;
    symbol?: string;
  }): MonitorTapeItem[] {
    this.prune(Date.now());
    let out = this.items;
    if (opts?.sinceMs != null) {
      out = out.filter((i) => i.atMs >= opts.sinceMs!);
    }
    if (opts?.symbol) {
      const sym = opts.symbol.toUpperCase();
      out = out.filter((i) => i.symbol === sym);
    }
    const lim = Math.min(
      opts?.limit ?? EVENT_TAPE_CONFIG.defaultListLimit,
      EVENT_TAPE_CONFIG.maxListLimit
    );
    return out.slice(0, lim).map((i) => ({ ...i }));
  }

  async list(opts?: {
    sinceMs?: number;
    limit?: number;
    symbol?: string;
  }): Promise<MonitorTapeItem[]> {
    return this.listSync(opts);
  }

  async size(): Promise<number> {
    this.prune(Date.now());
    return this.items.length;
  }

  async clear(): Promise<void> {
    this.items.length = 0;
  }

  /** Test helper — raw length without prune. */
  get rawLength(): number {
    return this.items.length;
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.retentionMs;
    if (this.items.length && this.items[this.items.length - 1]!.atMs < cutoff) {
      this.items = this.items.filter((i) => i.atMs >= cutoff);
    }
    if (this.items.length > this.maxItems) {
      this.items.length = this.maxItems;
    }
  }
}
