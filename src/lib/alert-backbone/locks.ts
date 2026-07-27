import { createHash } from "node:crypto";
import { getRedis } from "../redis.ts";

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

function lockKey(name: string): string {
  return `alertbb:lock:${name}`;
}

function newToken(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${process.pid}`)
    .digest("hex")
    .slice(0, 24);
}

/** Redis distributed lock with process-local fallback. */
export async function acquireDistributedLock(
  name: string,
  ttlMs = 30_000
): Promise<{ acquired: boolean; token: string | null }> {
  const key = lockKey(name);
  const token = newToken();
  const redis = getRedis();

  if (redis) {
    try {
      const ok = await redis.set(key, token, { nx: true, px: ttlMs });
      if (ok) return { acquired: true, token };
      return { acquired: false, token: null };
    } catch {
      /* memory */
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

export async function releaseDistributedLock(
  name: string,
  token: string
): Promise<void> {
  const key = lockKey(name);
  const redis = getRedis();
  if (redis) {
    try {
      const current = await redis.get<string>(key);
      if (current === token) await redis.del(key);
      return;
    } catch {
      /* memory */
    }
  }
  const cur = memoryLocks.get(key);
  if (cur?.token === token) memoryLocks.delete(key);
}

export function __resetAlertLocksForTests(): void {
  memoryLocks.clear();
}
