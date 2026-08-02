import type { MomentumSnapshot } from "./types.ts";

export interface MomentumSnapshotStore {
  put(snapshot: MomentumSnapshot): Promise<void> | void;
  putMany(snapshots: MomentumSnapshot[]): Promise<void> | void;
  get(symbol: string): Promise<MomentumSnapshot | null> | MomentumSnapshot | null;
}

export class MemoryMomentumSnapshotStore implements MomentumSnapshotStore {
  private readonly map = new Map<string, MomentumSnapshot>();
  private readonly maxEntries: number;
  private puts = 0;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  put(snapshot: MomentumSnapshot): void {
    if (!this.map.has(snapshot.symbol) && this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
    this.map.set(snapshot.symbol, snapshot);
    this.puts += 1;
  }

  putMany(snapshots: MomentumSnapshot[]): void {
    for (const s of snapshots) this.put(s);
  }

  get(symbol: string): MomentumSnapshot | null {
    return this.map.get(symbol.toUpperCase()) ?? this.map.get(symbol) ?? null;
  }

  size(): number {
    return this.map.size;
  }

  putCount(): number {
    return this.puts;
  }
}
