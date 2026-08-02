/**
 * Snapshot persistence ports — domain has no Redis/Prisma imports.
 * Adapters implement these for memory or Redis-backed compact replay.
 */

import type { CompactSnapshot } from "./types.ts";

export interface SnapshotStore {
  put(snapshot: CompactSnapshot): Promise<void> | void;
  putMany(snapshots: CompactSnapshot[]): Promise<void> | void;
  get(symbol: string): Promise<CompactSnapshot | null> | CompactSnapshot | null;
  listSymbols(): Promise<string[]> | string[];
}

/** In-memory bounded snapshot store (tests + single-process). */
export class MemorySnapshotStore implements SnapshotStore {
  private readonly map = new Map<string, CompactSnapshot>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  put(snapshot: CompactSnapshot): void {
    if (!this.map.has(snapshot.symbol) && this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
    this.map.set(snapshot.symbol, snapshot);
  }

  putMany(snapshots: CompactSnapshot[]): void {
    for (const s of snapshots) this.put(s);
  }

  get(symbol: string): CompactSnapshot | null {
    return this.map.get(symbol) ?? null;
  }

  listSymbols(): string[] {
    return [...this.map.keys()];
  }

  size(): number {
    return this.map.size;
  }
}
