/**
 * Lightweight job cursors for cron resume.
 * Prefers Redis when configured; falls back to process memory (safe, lossy across isolates).
 * Never throws — missing Redis must not fail the job.
 */

import { getRedis } from "../redis.ts";

type CheckpointValue = {
  cursor: string | null;
  updatedAt: number;
  meta?: Record<string, string | number | boolean | null>;
};

const memory = new Map<string, CheckpointValue>();
const REDIS_PREFIX = "tt:job-ckpt:";
const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

function redisKey(jobId: string): string {
  return `${REDIS_PREFIX}${jobId}`;
}

export async function getJobCheckpoint(
  jobId: string
): Promise<CheckpointValue | null> {
  const id = jobId.trim();
  if (!id) return null;

  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get<CheckpointValue>(redisKey(id));
      if (hit && typeof hit === "object") {
        memory.set(id, hit);
        return hit;
      }
    } catch {
      /* memory */
    }
  }

  return memory.get(id) ?? null;
}

export async function setJobCheckpoint(
  jobId: string,
  opts: {
    cursor: string | null;
    meta?: CheckpointValue["meta"];
    ttlSec?: number;
  }
): Promise<void> {
  const id = jobId.trim();
  if (!id) return;

  const value: CheckpointValue = {
    cursor: opts.cursor,
    updatedAt: Date.now(),
    meta: opts.meta,
  };
  memory.set(id, value);

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(redisKey(id), value, {
      ex: opts.ttlSec ?? DEFAULT_TTL_SEC,
    });
  } catch {
    /* memory ok */
  }
}

export function __resetJobCheckpointsForTests(): void {
  memory.clear();
}
