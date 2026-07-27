/**
 * Graceful drain flag — workers check this before starting new source work.
 * Survives within a process; Redis optional for multi-instance coordination.
 */
import { getRedis } from "../redis.ts";

let localDraining = false;

const DRAIN_KEY = "ingest:draining";

export async function beginIngestDrain(): Promise<void> {
  localDraining = true;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(DRAIN_KEY, "1", { ex: 120 });
    } catch {
      /* ignore */
    }
  }
}

export async function clearIngestDrain(): Promise<void> {
  localDraining = false;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(DRAIN_KEY);
    } catch {
      /* ignore */
    }
  }
}

export async function isIngestDraining(): Promise<boolean> {
  if (localDraining) return true;
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<string>(DRAIN_KEY);
      return v === "1" || v === "true";
    } catch {
      return localDraining;
    }
  }
  return localDraining;
}

export function __resetDrainForTests(): void {
  localDraining = false;
}
