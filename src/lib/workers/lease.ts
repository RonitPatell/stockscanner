/**
 * Distributed worker ownership (partition leases).
 * Prevents duplicate market workers when multiple replicas start.
 */

import { createHash, randomBytes } from "node:crypto";
import { getRedis } from "../redis.ts";

const memoryLeases = new Map<string, { token: string; expiresAt: number }>();

function leaseKey(name: string): string {
  return `tt:worker:lease:v1:${name}`;
}

function newToken(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${randomBytes(8).toString("hex")}:${process.pid}`)
    .digest("hex")
    .slice(0, 32);
}

export type LeaseHandle = {
  name: string;
  token: string;
  ttlMs: number;
};

/**
 * Acquire or renew a named lease. Only the holder may renew.
 * Falls back to process-local when Redis is unavailable (single-node only).
 */
export async function acquireWorkerLease(
  name: string,
  ttlMs = 45_000
): Promise<{ acquired: boolean; handle: LeaseHandle | null }> {
  const key = leaseKey(name);
  const token = newToken();
  const redis = getRedis();

  if (redis) {
    try {
      const ok = await redis.set(key, token, { nx: true, px: ttlMs });
      if (ok) {
        return { acquired: true, handle: { name, token, ttlMs } };
      }
      return { acquired: false, handle: null };
    } catch {
      /* memory fallback */
    }
  }

  const now = Date.now();
  const cur = memoryLeases.get(key);
  if (cur && cur.expiresAt > now) {
    return { acquired: false, handle: null };
  }
  memoryLeases.set(key, { token, expiresAt: now + ttlMs });
  return { acquired: true, handle: { name, token, ttlMs } };
}

/** Renew lease if we still own it. */
export async function renewWorkerLease(
  handle: LeaseHandle
): Promise<boolean> {
  const key = leaseKey(handle.name);
  const redis = getRedis();

  if (redis) {
    try {
      const current = await redis.get<string>(key);
      if (current !== handle.token) return false;
      await redis.set(key, handle.token, { px: handle.ttlMs });
      return true;
    } catch {
      /* memory */
    }
  }

  const cur = memoryLeases.get(key);
  if (!cur || cur.token !== handle.token) return false;
  cur.expiresAt = Date.now() + handle.ttlMs;
  return true;
}

export async function releaseWorkerLease(handle: LeaseHandle): Promise<void> {
  const key = leaseKey(handle.name);
  const redis = getRedis();
  if (redis) {
    try {
      const current = await redis.get<string>(key);
      if (current === handle.token) await redis.del(key);
      return;
    } catch {
      /* memory */
    }
  }
  const cur = memoryLeases.get(key);
  if (cur?.token === handle.token) memoryLeases.delete(key);
}

/** Who holds the lease (token prefix only — not for auth). */
export async function peekWorkerLease(
  name: string
): Promise<{ held: boolean; ageMs: number | null }> {
  const key = leaseKey(name);
  const redis = getRedis();
  if (redis) {
    try {
      const current = await redis.get<string>(key);
      return { held: Boolean(current), ageMs: null };
    } catch {
      /* fall through */
    }
  }
  const cur = memoryLeases.get(key);
  if (!cur) return { held: false, ageMs: null };
  const ageMs = Math.max(0, cur.expiresAt - Date.now());
  return { held: ageMs > 0, ageMs };
}

export function __resetWorkerLeasesForTests(): void {
  memoryLeases.clear();
}
