/**
 * Redis (or memory) store for the active Monitor public snapshot.
 * Build under a temporary key → validate → atomic pointer swap → keep previous.
 */

import type { MonitorPublicSnapshot } from "../../../domain/monitor/snapshot/index.ts";
import {
  MONITOR_SNAPSHOT_DEFAULT_TTL_SEC,
  validateMonitorPublicSnapshot,
  isSnapshotRenderable,
  decidePublishFreshness,
} from "../../../domain/monitor/snapshot/index.ts";

export interface SnapshotRedisLike {
  get(key: string): Promise<string | null> | string | null;
  set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean }
  ): Promise<unknown>;
  del?(...keys: string[]): Promise<unknown>;
}

const PREFIX = "tt:monitor:public-snapshot:v1";
export const SNAPSHOT_ACTIVE_PTR_KEY = `${PREFIX}:active`;
export const SNAPSHOT_PREV_PTR_KEY = `${PREFIX}:prev`;
const bodyKey = (id: string) => `${PREFIX}:body:${id}`;
const stagingKey = (id: string) => `${PREFIX}:staging:${id}`;
const PUBLISH_LOCK_KEY = `${PREFIX}:publish-lock`;

export type SnapshotPublishResult =
  | {
      ok: true;
      snapshotId: string;
      swapped: boolean;
      previousSnapshotId: string | null;
    }
  | {
      ok: false;
      reason:
        | "validation_failed"
        | "not_renderable"
        | "stale_market_data"
        | "lock_busy"
        | "store_error";
      issues?: { code: string; message: string; path?: string }[];
    };

export interface SnapshotStoreConfig {
  ttlSec?: number;
  lockTtlSec?: number;
}

function memoryBackend(): SnapshotRedisLike {
  const g = globalThis as typeof globalThis & {
    __ttMonitorSnapshotMem?: Map<string, { v: string; exp: number | null }>;
  };
  if (!g.__ttMonitorSnapshotMem) g.__ttMonitorSnapshotMem = new Map();
  const map = g.__ttMonitorSnapshotMem;
  const now = () => Date.now();
  const alive = (exp: number | null) => exp == null || exp > now();
  return {
    async get(key) {
      const e = map.get(key);
      if (!e || !alive(e.exp)) {
        map.delete(key);
        return null;
      }
      return e.v;
    },
    async set(key, value, opts) {
      if (opts?.nx && map.has(key) && alive(map.get(key)!.exp)) {
        return null;
      }
      const exp = opts?.ex != null ? now() + opts.ex * 1000 : null;
      map.set(key, { v: value, exp });
      return "OK";
    },
    async del(...keys) {
      for (const k of keys) map.delete(k);
      return keys.length;
    },
  };
}

export function __resetMonitorSnapshotMemoryForTests(): void {
  const g = globalThis as typeof globalThis & {
    __ttMonitorSnapshotMem?: Map<string, { v: string; exp: number | null }>;
  };
  g.__ttMonitorSnapshotMem = new Map();
}

export class MonitorSnapshotRedisStore {
  private readonly redis: SnapshotRedisLike;
  private readonly ttlSec: number;
  private readonly lockTtlSec: number;

  constructor(redis?: SnapshotRedisLike | null, config?: SnapshotStoreConfig) {
    this.redis = redis ?? memoryBackend();
    this.ttlSec = config?.ttlSec ?? MONITOR_SNAPSHOT_DEFAULT_TTL_SEC;
    this.lockTtlSec = config?.lockTtlSec ?? 5;
  }

  async getActive(): Promise<MonitorPublicSnapshot | null> {
    const id = await this.redis.get(SNAPSHOT_ACTIVE_PTR_KEY);
    if (!id) return null;
    return this.getById(id);
  }

  async getPrevious(): Promise<MonitorPublicSnapshot | null> {
    const id = await this.redis.get(SNAPSHOT_PREV_PTR_KEY);
    if (!id) return null;
    return this.getById(id);
  }

  async getById(snapshotId: string): Promise<MonitorPublicSnapshot | null> {
    const raw = await this.redis.get(bodyKey(snapshotId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MonitorPublicSnapshot;
    } catch {
      return null;
    }
  }

  async rollbackToPrevious(): Promise<MonitorPublicSnapshot | null> {
    const prevId = await this.redis.get(SNAPSHOT_PREV_PTR_KEY);
    if (!prevId) return null;
    const body = await this.getById(prevId);
    if (!body) return null;
    const validation = validateMonitorPublicSnapshot(body);
    if (!validation.ok || !isSnapshotRenderable(body)) return null;
    const activeId = await this.redis.get(SNAPSHOT_ACTIVE_PTR_KEY);
    await this.redis.set(SNAPSHOT_ACTIVE_PTR_KEY, prevId, { ex: this.ttlSec });
    if (activeId && activeId !== prevId) {
      await this.redis.set(SNAPSHOT_PREV_PTR_KEY, activeId, {
        ex: this.ttlSec,
      });
    }
    return body;
  }

  /**
   * Write staging → validate → freshness check → swap active pointer.
   * Never replaces a valid active snapshot with an invalid/incomplete one.
   */
  async publish(candidate: MonitorPublicSnapshot): Promise<SnapshotPublishResult> {
    const lock = await this.redis.set(PUBLISH_LOCK_KEY, candidate.snapshotId, {
      nx: true,
      ex: this.lockTtlSec,
    });
    if (lock === null) {
      return { ok: false, reason: "lock_busy" };
    }

    try {
      const validation = validateMonitorPublicSnapshot(candidate);
      if (!validation.ok) {
        return {
          ok: false,
          reason: "validation_failed",
          issues: validation.issues,
        };
      }
      if (!isSnapshotRenderable(candidate)) {
        return { ok: false, reason: "not_renderable" };
      }

      const active = await this.getActive();
      const freshness = decidePublishFreshness(candidate, active);
      if (!freshness.allow) {
        return { ok: false, reason: "stale_market_data" };
      }

      const stage = stagingKey(candidate.snapshotId);
      await this.redis.set(stage, JSON.stringify(candidate), {
        ex: this.ttlSec,
      });

      const stagedRaw = await this.redis.get(stage);
      if (!stagedRaw) {
        return { ok: false, reason: "store_error" };
      }
      let staged: MonitorPublicSnapshot;
      try {
        staged = JSON.parse(stagedRaw) as MonitorPublicSnapshot;
      } catch {
        return { ok: false, reason: "store_error" };
      }
      const reval = validateMonitorPublicSnapshot(staged);
      if (!reval.ok || !isSnapshotRenderable(staged)) {
        return {
          ok: false,
          reason: "validation_failed",
          issues: reval.issues,
        };
      }

      await this.redis.set(bodyKey(staged.snapshotId), stagedRaw, {
        ex: this.ttlSec,
      });

      const previousId =
        (await this.redis.get(SNAPSHOT_ACTIVE_PTR_KEY))?.toString() ?? null;
      await this.redis.set(SNAPSHOT_ACTIVE_PTR_KEY, staged.snapshotId, {
        ex: this.ttlSec,
      });
      if (previousId && previousId !== staged.snapshotId) {
        await this.redis.set(SNAPSHOT_PREV_PTR_KEY, previousId, {
          ex: this.ttlSec,
        });
        const prevBody = await this.redis.get(bodyKey(previousId));
        if (prevBody) {
          await this.redis.set(bodyKey(previousId), prevBody, {
            ex: this.ttlSec,
          });
        }
      }

      if (this.redis.del) {
        await this.redis.del(stage);
      }

      return {
        ok: true,
        snapshotId: staged.snapshotId,
        swapped: true,
        previousSnapshotId: previousId,
      };
    } catch {
      return { ok: false, reason: "store_error" };
    } finally {
      if (this.redis.del) {
        await this.redis.del(PUBLISH_LOCK_KEY);
      } else {
        await this.redis.set(PUBLISH_LOCK_KEY, "", { ex: 1 });
      }
    }
  }
}
