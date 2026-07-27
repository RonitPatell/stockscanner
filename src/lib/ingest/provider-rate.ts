import { rateLimit } from "../rate-limit.ts";
import type { SourceRateLimit } from "./types.ts";

/** Per-provider ingest rate limit (Redis-backed when available). */
export async function acquireProviderPermit(
  provider: string,
  limit: SourceRateLimit
): Promise<{ ok: boolean; retryAfterMs: number }> {
  const result = await rateLimit(
    `ingest:provider:${provider}`,
    limit.max,
    limit.windowMs,
    { strict: true }
  );
  if (result.ok) return { ok: true, retryAfterMs: 0 };
  return {
    ok: false,
    retryAfterMs: Math.max(0, result.resetAt - Date.now()),
  };
}
