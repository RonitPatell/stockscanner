import type { CatalystItem } from "@/types";
import { getRedis } from "./redis";

export type FeedCacheKey = "all" | "movers";

export interface FeedMeta {
  updatedAt: string;
  count: number;
  source: "redis" | "memory";
}

const REDIS_TTL_SEC = 300;
const MEMORY_TTL_MS = 60_000;
const STALE_MEMORY_TTL_MS = 10 * 60_000;
const REDIS_BUDGET_MS = 10_000;

async function withRedisBudget<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_BUDGET_MS)),
  ]);
}

type MemoryEntry = { ts: number; items: CatalystItem[]; meta: FeedMeta };

const globalStore = globalThis as typeof globalThis & {
  __trustFeedCache?: Map<FeedCacheKey, MemoryEntry>;
};

function memoryStore(): Map<FeedCacheKey, MemoryEntry> {
  if (!globalStore.__trustFeedCache) {
    globalStore.__trustFeedCache = new Map();
  }
  return globalStore.__trustFeedCache;
}

function redisKey(key: FeedCacheKey): string {
  return `feed:${key}:v1`;
}

function metaKey(): string {
  return "feed:meta:v1";
}

export function slimFeedItems(items: CatalystItem[]): CatalystItem[] {
  return items.map((c) => ({
    ...c,
    aiSummary: c.aiSummary ? c.aiSummary.slice(0, 200) : c.aiSummary,
    keyPoints: undefined,
  }));
}

export async function getCachedFeed(
  key: FeedCacheKey
): Promise<{ items: CatalystItem[]; meta: FeedMeta | null }> {
  const redis = getRedis();
  if (redis) {
    try {
      const [items, meta] = await withRedisBudget(
        () =>
          Promise.all([
            redis.get<CatalystItem[]>(redisKey(key)),
            redis.get<FeedMeta>(metaKey()),
          ]),
        [null, null] as [CatalystItem[] | null, FeedMeta | null]
      );
      if (items && Array.isArray(items) && items.length > 0) {
        return {
          items,
          meta: meta ?? {
            updatedAt: new Date().toISOString(),
            count: items.length,
            source: "redis",
          },
        };
      }
    } catch {
      /* fall through to memory */
    }
  }

  const mem = memoryStore().get(key);
  if (mem) {
    const age = Date.now() - mem.ts;
    if (age < MEMORY_TTL_MS) {
      return { items: mem.items, meta: mem.meta };
    }
    if (redis && age < STALE_MEMORY_TTL_MS && mem.items.length > 0) {
      return {
        items: mem.items,
        meta: { ...mem.meta, source: "memory" as const },
      };
    }
  }
  return { items: [], meta: null };
}

export async function setCachedFeed(
  key: FeedCacheKey,
  items: CatalystItem[],
  meta?: Partial<FeedMeta>
): Promise<void> {
  const slim = slimFeedItems(items);
  const fullMeta: FeedMeta = {
    updatedAt: new Date().toISOString(),
    count: slim.length,
    source: getRedis() ? "redis" : "memory",
    ...meta,
  };

  memoryStore().set(key, { ts: Date.now(), items: slim, meta: fullMeta });

  const redis = getRedis();
  if (redis) {
    try {
      await Promise.all([
        redis.set(redisKey(key), slim, { ex: REDIS_TTL_SEC }),
        redis.set(metaKey(), fullMeta, { ex: REDIS_TTL_SEC }),
      ]);
    } catch {
      /* memory fallback already set */
    }
  }
}

export async function getFeedMeta(): Promise<FeedMeta | null> {
  const { meta } = await getCachedFeed("all");
  return meta;
}
