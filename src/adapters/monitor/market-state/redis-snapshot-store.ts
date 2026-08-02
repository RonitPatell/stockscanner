/**
 * Redis-backed compact snapshot store for Monitor market state.
 * Adapter-only — inject a Redis client; never embeds secrets.
 *
 * Keys: tt:monitor:mstate:v1:{SYMBOL}
 * Values: JSON CompactSnapshot (compact, periodic — not per tick)
 */

import type {
  CompactSnapshot,
  SnapshotStore,
} from "../../../domain/monitor/market-state/index.ts";
import { MONITOR_MARKET_STATE_VERSION } from "../../../domain/monitor/market-state/index.ts";

export interface RedisLike {
  set(key: string, value: string): Promise<unknown> | unknown;
  get(key: string): Promise<string | null> | string | null;
  /** Optional — used for listSymbols when available */
  keys?(pattern: string): Promise<string[]> | string[];
}

const PREFIX = `tt:monitor:mstate:${MONITOR_MARKET_STATE_VERSION}:`;

export class RedisSnapshotStore implements SnapshotStore {
  private readonly redis: RedisLike;
  private readonly known = new Set<string>();

  constructor(redis: RedisLike) {
    this.redis = redis;
  }

  private key(symbol: string): string {
    return `${PREFIX}${symbol.toUpperCase()}`;
  }

  async put(snapshot: CompactSnapshot): Promise<void> {
    const sym = snapshot.symbol.toUpperCase();
    await this.redis.set(this.key(sym), JSON.stringify(snapshot));
    this.known.add(sym);
  }

  async putMany(snapshots: CompactSnapshot[]): Promise<void> {
    for (const s of snapshots) {
      await this.put(s);
    }
  }

  async get(symbol: string): Promise<CompactSnapshot | null> {
    const raw = await this.redis.get(this.key(symbol));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CompactSnapshot;
    } catch {
      return null;
    }
  }

  async listSymbols(): Promise<string[]> {
    if (this.redis.keys) {
      const keys = await this.redis.keys(`${PREFIX}*`);
      return keys.map((k) => k.slice(PREFIX.length));
    }
    return [...this.known];
  }
}
