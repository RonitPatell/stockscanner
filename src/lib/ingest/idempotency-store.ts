import { getRedis } from "../redis.ts";
import { buildIdempotencyKey } from "./idempotency.ts";
import type { NewsArticle } from "../../types/index.ts";

const memorySeen = new Map<string, number>();
const IDEMP_TTL_MS = 6 * 60 * 60_000;

function redisKey(key: string): string {
  return `ingest:idemp:${key}`;
}

export function idempotencyKeyFor(article: NewsArticle): string {
  return buildIdempotencyKey({
    providerItemId: article.trace?.providerItemId ?? article.id,
    url: article.url,
    title: article.headline,
    ticker: article.symbol,
    publishedAt: article.publishedAt,
  });
}

/** Check if already claimed — does not write. */
export async function peekIdempotency(
  article: NewsArticle
): Promise<{ seen: boolean; key: string }> {
  const key = idempotencyKeyFor(article);
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get(redisKey(key));
      if (v != null) return { seen: true, key };
      return { seen: false, key };
    } catch {
      /* memory */
    }
  }
  const now = Date.now();
  const exp = memorySeen.get(key);
  if (exp && exp > now) return { seen: true, key };
  return { seen: false, key };
}

/** Mark item as processed (call only after successful DB ingest or intentional skip). */
export async function claimIdempotency(
  article: NewsArticle
): Promise<{ duplicate: boolean; key: string }> {
  const key = idempotencyKeyFor(article);

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

/** Allow retry after verify/quarantine failure (was burning keys for 6h). */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  memorySeen.delete(key);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(redisKey(key));
    } catch {
      /* ignore */
    }
  }
}

/**
 * Filter to unseen articles without claiming.
 * Claim happens after successful ingest so failed verifies can retry.
 */
export async function filterFreshArticles(
  articles: NewsArticle[]
): Promise<NewsArticle[]> {
  const out: NewsArticle[] = [];
  for (const a of articles) {
    const { seen } = await peekIdempotency(a);
    if (!seen) out.push(a);
  }
  return out;
}

/** Mark a batch as seen after they were ingested or already in DB. */
export async function markArticlesSeen(articles: NewsArticle[]): Promise<void> {
  for (const a of articles) {
    await claimIdempotency(a);
  }
}

export function __resetIdempotencyForTests(): void {
  memorySeen.clear();
}
