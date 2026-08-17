/**
 * Short-lived Portfolio Brief cache (per user + window).
 * Avoids recomputing on every dashboard poll. Never shared across users.
 */

import { getRedis } from "../redis.ts";
import type { PortfolioBriefDto } from "./types.ts";

const TTL_SEC = 120;
const memory = new Map<string, { exp: number; brief: PortfolioBriefDto }>();

function cacheKey(userId: string, _since: Date, _until: Date, windowDays = 7): string {
  return `portfolio-brief:v2:${userId}:${windowDays}`;
}

export async function getCachedPortfolioBrief(
  userId: string,
  since: Date,
  until: Date
): Promise<PortfolioBriefDto | null> {
  const key = cacheKey(userId, since, until);
  const mem = memory.get(key);
  if (mem && mem.exp > Date.now()) return mem.brief;

  const redis = getRedis();
  if (!redis) return null;
  try {
    const hit = await redis.get<PortfolioBriefDto>(key);
    if (hit && hit.meta?.version) {
      memory.set(key, { exp: Date.now() + TTL_SEC * 1000, brief: hit });
      return hit;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function setCachedPortfolioBrief(
  userId: string,
  since: Date,
  until: Date,
  brief: PortfolioBriefDto
): Promise<void> {
  const key = cacheKey(userId, since, until);
  memory.set(key, { exp: Date.now() + TTL_SEC * 1000, brief });
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, brief, { ex: TTL_SEC });
  } catch {
    /* ignore */
  }
}
