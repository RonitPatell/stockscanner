import { createHash } from "node:crypto";
import { getRedis } from "../redis.ts";
import type { DeadLetterItem, IngestTier } from "./types.ts";

const DLQ_KEY = "ingest:dlq:v1";
const DLQ_MAX = 200;
const memoryDlq: DeadLetterItem[] = [];

function newId(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
}

export async function pushDeadLetter(input: {
  sourceId: string;
  tier: IngestTier;
  error: string;
  attempt?: number;
  payloadSummary?: string;
}): Promise<DeadLetterItem> {
  const item: DeadLetterItem = {
    id: newId(),
    sourceId: input.sourceId,
    tier: input.tier,
    error: input.error.slice(0, 500),
    attempt: input.attempt ?? 1,
    payloadSummary: (input.payloadSummary ?? "").slice(0, 200),
    createdAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(DLQ_KEY, JSON.stringify(item));
      await redis.ltrim(DLQ_KEY, 0, DLQ_MAX - 1);
      await redis.expire(DLQ_KEY, 7 * 24 * 3600);
      return item;
    } catch {
      /* memory */
    }
  }

  memoryDlq.unshift(item);
  if (memoryDlq.length > DLQ_MAX) memoryDlq.length = DLQ_MAX;
  return item;
}

export async function listDeadLetters(limit = 50): Promise<DeadLetterItem[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(DLQ_KEY, 0, Math.max(0, limit - 1));
      return (rows ?? [])
        .map((r) => {
          try {
            return typeof r === "string" ? (JSON.parse(r) as DeadLetterItem) : (r as DeadLetterItem);
          } catch {
            return null;
          }
        })
        .filter((x): x is DeadLetterItem => !!x);
    } catch {
      /* memory */
    }
  }
  return memoryDlq.slice(0, limit);
}

export async function removeDeadLetter(id: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(DLQ_KEY, 0, DLQ_MAX - 1);
      const kept: string[] = [];
      let removed = false;
      for (const r of rows ?? []) {
        try {
          const item =
            typeof r === "string" ? (JSON.parse(r) as DeadLetterItem) : (r as DeadLetterItem);
          if (item.id === id) {
            removed = true;
            continue;
          }
          kept.push(JSON.stringify(item));
        } catch {
          kept.push(typeof r === "string" ? r : JSON.stringify(r));
        }
      }
      await redis.del(DLQ_KEY);
      if (kept.length > 0) {
        // lpush in reverse so order preserved
        for (let i = kept.length - 1; i >= 0; i--) {
          await redis.lpush(DLQ_KEY, kept[i]);
        }
        await redis.expire(DLQ_KEY, 7 * 24 * 3600);
      }
      return removed;
    } catch {
      /* memory */
    }
  }

  const idx = memoryDlq.findIndex((d) => d.id === id);
  if (idx < 0) return false;
  memoryDlq.splice(idx, 1);
  return true;
}

export async function getDeadLetter(id: string): Promise<DeadLetterItem | null> {
  const all = await listDeadLetters(DLQ_MAX);
  return all.find((d) => d.id === id) ?? null;
}

export function __resetDlqForTests(): void {
  memoryDlq.length = 0;
}
