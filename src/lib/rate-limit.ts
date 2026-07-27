import { getRedis } from "@/lib/redis";

type Bucket = { count: number; resetAt: number };

/** Per-isolate memory fallback when Redis is unavailable (still stops casual spam). */
const memory = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs;
    memory.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt };
  }
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt };
}

/**
 * Sliding fixed-window rate limit. Prefers Upstash Redis when configured.
 * Auth-sensitive callers should pass `strict: true` so memory fallback uses
 * tighter limits when Redis is unavailable (serverless multi-instance risk).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options?: { strict?: boolean }
): Promise<RateLimitResult> {
  const redis = getRedis();
  const effectiveLimit =
    !redis && options?.strict ? Math.max(3, Math.floor(limit / 2)) : limit;

  if (!redis) {
    if (options?.strict && process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] Redis unset — using tighter in-memory limits for",
        key.split(":")[0]
      );
    }
    return memoryLimit(key, effectiveLimit, windowMs);
  }

  try {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    const ttl = await redis.pttl(redisKey);
    const resetAt = Date.now() + (ttl > 0 ? ttl : windowMs);
    if (count > limit) {
      return { ok: false, remaining: 0, resetAt };
    }
    return { ok: true, remaining: Math.max(0, limit - count), resetAt };
  } catch {
    return memoryLimit(key, effectiveLimit, windowMs);
  }
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

export function rateLimitHeaders(result: RateLimitResult, limit: number): HeadersInit {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok
      ? {}
      : { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))) }),
  };
}
