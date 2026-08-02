/**
 * Redis-backed Event Tape retention (list + TTL + max length).
 * Adapter-only — inject a Redis client; never embeds secrets.
 *
 * Key: tt:monitor:event-tape:v1:global
 */

import {
  EVENT_TAPE_CONFIG,
  MONITOR_EVENT_TAPE_VERSION,
  type EventTapeStorePort,
  type MonitorTapeItem,
} from "../../../domain/monitor/event-tape/index.ts";

export interface RedisListLike {
  lpush(key: string, ...values: string[]): Promise<unknown> | unknown;
  ltrim(key: string, start: number, stop: number): Promise<unknown> | unknown;
  lrange(
    key: string,
    start: number,
    stop: number
  ): Promise<string[] | null> | string[] | null;
  expire(key: string, seconds: number): Promise<unknown> | unknown;
}

const KEY = `tt:monitor:event-tape:${MONITOR_EVENT_TAPE_VERSION}:global`;

export class RedisEventTapeStore implements EventTapeStorePort {
  private readonly redis: RedisListLike;
  private readonly maxItems: number;
  private readonly retentionSec: number;
  /** Memory mirror for size()/fallback when Redis briefly fails. */
  private mirror: MonitorTapeItem[] = [];

  constructor(
    redis: RedisListLike,
    opts?: { maxItems?: number; retentionMs?: number }
  ) {
    this.redis = redis;
    this.maxItems = opts?.maxItems ?? EVENT_TAPE_CONFIG.retentionMaxItems;
    this.retentionSec = Math.ceil(
      (opts?.retentionMs ?? EVENT_TAPE_CONFIG.retentionMs) / 1000
    );
  }

  async append(items: MonitorTapeItem[]): Promise<void> {
    if (!items.length) return;
    // Newest first in mirror
    this.mirror.unshift(...[...items].reverse());
    if (this.mirror.length > this.maxItems) {
      this.mirror.length = this.maxItems;
    }
    try {
      const payload = items.map((i) => JSON.stringify(i));
      // LPUSH newest first — push in reverse so final order is newest→oldest
      await this.redis.lpush(KEY, ...[...payload].reverse());
      await this.redis.ltrim(KEY, 0, this.maxItems - 1);
      await this.redis.expire(KEY, this.retentionSec);
    } catch {
      /* keep memory mirror */
    }
  }

  async list(opts?: {
    sinceMs?: number;
    limit?: number;
    symbol?: string;
  }): Promise<MonitorTapeItem[]> {
    const lim = Math.min(
      opts?.limit ?? EVENT_TAPE_CONFIG.defaultListLimit,
      EVENT_TAPE_CONFIG.maxListLimit
    );
    let rows = await this.readRedis(lim * 2);
    if (!rows.length) rows = this.mirror.slice(0, lim * 2);

    if (opts?.sinceMs != null) {
      rows = rows.filter((i) => i.atMs >= opts.sinceMs!);
    }
    if (opts?.symbol) {
      const sym = opts.symbol.toUpperCase();
      rows = rows.filter((i) => i.symbol === sym);
    }
    return rows.slice(0, lim);
  }

  async size(): Promise<number> {
    const rows = await this.readRedis(this.maxItems);
    return rows.length || this.mirror.length;
  }

  async clear(): Promise<void> {
    this.mirror.length = 0;
  }

  private async readRedis(count: number): Promise<MonitorTapeItem[]> {
    try {
      const raw = await this.redis.lrange(KEY, 0, Math.max(0, count - 1));
      if (!raw?.length) return [];
      return raw
        .map((r) => {
          try {
            return typeof r === "string"
              ? (JSON.parse(r) as MonitorTapeItem)
              : (r as MonitorTapeItem);
          } catch {
            return null;
          }
        })
        .filter((x): x is MonitorTapeItem => !!x && !!x.id && !!x.symbol);
    } catch {
      return [];
    }
  }
}

export { KEY as EVENT_TAPE_REDIS_KEY };
