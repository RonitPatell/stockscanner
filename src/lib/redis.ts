import { Redis } from "@upstash/redis";

let client: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function getRedis(): Redis | null {
  if (!isRedisConfigured()) return null;
  if (!client) {
    client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return client;
}

/** Scale mode: shared cache + cron ingest (no per-user DB/ingest). */
export function isScaleMode(): boolean {
  return isRedisConfigured() || process.env.SCALE_MODE === "true";
}
