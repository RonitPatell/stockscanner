/**
 * Process-local active Monitor SSE client counter.
 * Cross-instance totals are approximate without Redis; we also keep a soft Redis gauge.
 */

import { getRedis } from "@/lib/redis";

const REDIS_KEY = "tt:monitor:ops:v1:active_clients";

const g = globalThis as typeof globalThis & {
  __ttMonitorActiveClients?: number;
};

function localCount(): number {
  return Math.max(0, g.__ttMonitorActiveClients ?? 0);
}

export function monitorStreamClientConnected(): void {
  g.__ttMonitorActiveClients = localCount() + 1;
  void bumpRedis(1);
}

export function monitorStreamClientDisconnected(): void {
  g.__ttMonitorActiveClients = Math.max(0, localCount() - 1);
  void bumpRedis(-1);
}

export function getMonitorActiveClientsLocal(): number {
  return localCount();
}

export async function getMonitorActiveClients(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const n = await redis.get<number>(REDIS_KEY);
      if (typeof n === "number" && Number.isFinite(n)) {
        return Math.max(n, localCount());
      }
    } catch {
      /* local */
    }
  }
  return localCount();
}

async function bumpRedis(delta: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const next = Math.max(0, (await redis.get<number>(REDIS_KEY)) ?? 0) + delta;
    await redis.set(REDIS_KEY, next, { ex: 3600 });
  } catch {
    /* ignore */
  }
}

export function __resetMonitorActiveClientsForTests(): void {
  g.__ttMonitorActiveClients = 0;
}
