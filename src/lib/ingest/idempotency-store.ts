import { getRedis } from "../redis.ts";
import { buildIdempotencyKey } from "./idempotency.ts";
import type { NewsArticle } from "../../types/index.ts";

const memorySeen = new Map<string, number>();
const IDEMP_TTL_MS = 6 * 60 * 60_000;

function redisKey(key: string): string {
  return `ingest:idemp:${key}`;
}

/** Returns true if this item was already seen (duplicate). */
export async function claimIdempotency(
  article: NewsArticle
): Promise<{ duplicate: boolean; key: string }> {
  const key = buildIdempotencyKey({
    providerItemId: article.trace?.providerItemId ?? article.id,
    url: article.url,
    title: article.headline,
    ticker: article.symbol,
    publishedAt: article.publishedAt,
  });

  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(redisKey(key), "1", {
        nx: true,
        px: IDEMP_TTL_MS,
      });
      if (ok) {
        return { duplicate: false, key };
      }
      return { duplicate: true, key };
    } catch {
      /* memory */
    }
  }

  const now = Date.now();
  // prune occasionally
  if (memorySeen.size > 20_000) {
    for (const [k, exp] of memorySeen) {
      if (exp <= now) memorySeen.delete(k);
    }
  }
  const exp = memorySeen.get(key);
  if (exp && exp > now) return { duplicate: true, key };
  memorySeen.set(key, now + IDEMP_TTL_MS);
  return { duplicate: false, key };
}

export async function filterFreshArticles(
  articles: NewsArticle[]
): Promise<NewsArticle[]> {
  const out: NewsArticle[] = [];
  for (const a of articles) {
    const { duplicate } = await claimIdempotency(a);
    if (!duplicate) out.push(a);
  }
  return out;
}

export function __resetIdempotencyForTests(): void {
  memorySeen.clear();
}
