import { createHash } from "node:crypto";
import { getRedis } from "../redis.ts";

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

function lockKey(partition: string): string {
  return `ingest:lock:${partition}`;
}

function newToken(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${process.pid}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Distributed lock for a source partition.
 * Prefers Redis SET NX PX; falls back to process-local lock when Redis is down.
 */
export async function acquirePartitionLock(
  partition: string,
  ttlMs = 45_000
): Promise<{ acquired: boolean; token: string | null }> {
  const key = lockKey(partition);
  const token = newToken();
  const redis = getRedis();

  if (redis) {
    try {
      const ok = await redis.set(key, token, { nx: true, px: ttlMs });
      if (ok) {
        return { acquired: true, token };
      }
      return { acquired: false, token: null };
    } catch {
      /* fall through to memory */
    }
  }

  const now = Date.now();
  const cur = memoryLocks.get(key);
  if (cur && cur.expiresAt > now) {
    return { acquired: false, token: null };
  }
  memoryLocks.set(key, { token, expiresAt: now + ttlMs });
  return { acquired: true, token };
}

/** Release only if we still own the lock (compare token). */
export async function releasePartitionLock(
  partition: string,
  token: string
): Promise<void> {
  const key = lockKey(partition);
  const redis = getRedis();

  if (redis) {
    try {
      const current = await redis.get<string>(key);
      if (current === token) {
        await redis.del(key);
      }
      return;
    } catch {
      /* fall through */
    }
  }

  const cur = memoryLocks.get(key);
  if (cur?.token === token) memoryLocks.delete(key);
}

/** Test helper — clear in-memory locks. */
export function __resetMemoryLocksForTests(): void {
  memoryLocks.clear();
}
