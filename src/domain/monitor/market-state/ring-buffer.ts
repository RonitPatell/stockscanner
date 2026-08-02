/**
 * Fixed-capacity ring buffer — O(1) push, bounded memory.
 */

export class RingBuffer<T> {
  private readonly buf: Array<T | undefined>;
  private head = 0; // next write
  private count = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) throw new Error("capacity_must_be_positive");
    this.capacity = capacity;
    this.buf = new Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  /** Oldest → newest */
  toArray(): T[] {
    const out: T[] = [];
    const start =
      this.count === this.capacity ? this.head : (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const v = this.buf[idx];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  /** Iterate newest→oldest until predicate false / limit */
  forEachRecent(fn: (item: T) => boolean | void): void {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      const v = this.buf[idx];
      if (v === undefined) continue;
      if (fn(v) === false) break;
    }
  }
}

/** Compact trade tick stored in ring */
export interface TradeTick {
  t: number; // ms
  price: number;
  size: number;
  dollar: number;
  side: 0 | 1 | 2; // 0 unknown, 1 buy, 2 sell
  eligibleLast: boolean;
  eligibleVol: boolean;
}

export interface QuoteTick {
  t: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  crossed: boolean;
  stale: boolean;
}

/** 1-second bar for mid windows */
export interface SecondBar {
  sec: number; // floor(t/1000)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  dollar: number;
  trades: number;
  buyVol: number;
  sellVol: number;
}
