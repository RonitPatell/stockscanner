import { createHash } from "node:crypto";
import { getRedis } from "../redis.ts";
import { backoffWithJitterMs } from "../ingest/schedule.ts";
import type { AlertEventEnvelope, AlertQueueClass, QueueJob } from "./types.ts";
import { ALERT_QUEUE_CLASSES } from "./types.ts";

const QUEUE_MAX = 5_000;
const DLQ_MAX = 500;

type MemoryQueues = {
  ready: QueueJob[];
  processing: QueueJob[];
  dlq: QueueJob[];
};

const memory = new Map<AlertQueueClass, MemoryQueues>();

function ensureMem(q: AlertQueueClass): MemoryQueues {
  let m = memory.get(q);
  if (!m) {
    m = { ready: [], processing: [], dlq: [] };
    memory.set(q, m);
  }
  return m;
}

function readyKey(q: AlertQueueClass): string {
  return `alertbb:q:${q}:ready`;
}
function procKey(q: AlertQueueClass): string {
  return `alertbb:q:${q}:processing`;
}
function dlqKey(q: AlertQueueClass): string {
  return `alertbb:q:${q}:dlq`;
}

function newJobId(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
}

export async function enqueueAlertJob(
  envelope: AlertEventEnvelope,
  opts: { delayMs?: number } = {}
): Promise<QueueJob> {
  const now = Date.now();
  const job: QueueJob = {
    id: newJobId(),
    envelope: { ...envelope, attempt: envelope.attempt ?? 1 },
    enqueuedAt: new Date(now).toISOString(),
    availableAt: new Date(now + (opts.delayMs ?? 0)).toISOString(),
    attempt: envelope.attempt ?? 1,
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(readyKey(envelope.queue), JSON.stringify(job));
      await redis.ltrim(readyKey(envelope.queue), 0, QUEUE_MAX - 1);
      await redis.expire(readyKey(envelope.queue), 7 * 24 * 3600);
      return job;
    } catch {
      /* memory */
    }
  }

  const mem = ensureMem(envelope.queue);
  mem.ready.unshift(job);
  if (mem.ready.length > QUEUE_MAX) mem.ready.length = QUEUE_MAX;
  return job;
}

function parseJob(raw: unknown): QueueJob | null {
  try {
    const j =
      typeof raw === "string" ? (JSON.parse(raw) as QueueJob) : (raw as QueueJob);
    if (!j?.id || !j?.envelope) return null;
    return j;
  } catch {
    return null;
  }
}

/** Dequeue next available job (persistently moves to processing). */
export async function dequeueAlertJob(
  queue: AlertQueueClass,
  now = Date.now()
): Promise<QueueJob | null> {
  const redis = getRedis();
  if (redis) {
    try {
      // Upstash: lrange + lrem pattern (no BRPOP on REST)
      const rows = await redis.lrange(readyKey(queue), 0, 49);
      for (const row of rows ?? []) {
        const job = parseJob(row);
        if (!job) continue;
        if (new Date(job.availableAt).getTime() > now) continue;
        const removed = await redis.lrem(readyKey(queue), 1, row);
        if (!removed) continue;
        await redis.lpush(procKey(queue), JSON.stringify(job));
        await redis.ltrim(procKey(queue), 0, QUEUE_MAX - 1);
        await redis.expire(procKey(queue), 7 * 24 * 3600);
        return job;
      }
      return null;
    } catch {
      /* memory */
    }
  }

  const mem = ensureMem(queue);
  const idx = mem.ready.findIndex(
    (j) => new Date(j.availableAt).getTime() <= now
  );
  if (idx < 0) return null;
  const [job] = mem.ready.splice(idx, 1);
  mem.processing.unshift(job);
  return job;
}

export async function ackAlertJob(
  queue: AlertQueueClass,
  jobId: string
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(procKey(queue), 0, QUEUE_MAX - 1);
      for (const row of rows ?? []) {
        const job = parseJob(row);
        if (job?.id === jobId) {
          await redis.lrem(procKey(queue), 1, row);
          return;
        }
      }
      return;
    } catch {
      /* memory */
    }
  }
  const mem = ensureMem(queue);
  mem.processing = mem.processing.filter((j) => j.id !== jobId);
}

export async function failAlertJob(
  job: QueueJob,
  error: string,
  opts: { maxAttempts?: number } = {}
): Promise<"retried" | "dlq"> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const attempt = job.attempt + 1;
  await ackAlertJob(job.envelope.queue, job.id);

  if (attempt > maxAttempts) {
    const dead: QueueJob = {
      ...job,
      attempt,
      envelope: { ...job.envelope, attempt },
    };
    const redis = getRedis();
    if (redis) {
      try {
        await redis.lpush(
          dlqKey(job.envelope.queue),
          JSON.stringify({ ...dead, error: error.slice(0, 500) })
        );
        await redis.ltrim(dlqKey(job.envelope.queue), 0, DLQ_MAX - 1);
        await redis.expire(dlqKey(job.envelope.queue), 7 * 24 * 3600);
        return "dlq";
      } catch {
        /* memory */
      }
    }
    const mem = ensureMem(job.envelope.queue);
    mem.dlq.unshift(dead);
    if (mem.dlq.length > DLQ_MAX) mem.dlq.length = DLQ_MAX;
    return "dlq";
  }

  const delay = backoffWithJitterMs(attempt, { baseMs: 1_000, maxMs: 5 * 60_000 });
  await enqueueAlertJob(
    { ...job.envelope, attempt },
    { delayMs: delay }
  );
  return "retried";
}

/** Requeue orphaned processing jobs after worker restart (persistence recovery). */
export async function recoverProcessingJobs(
  queue: AlertQueueClass,
  olderThanMs = 60_000
): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  let recovered = 0;
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(procKey(queue), 0, QUEUE_MAX - 1);
      for (const row of rows ?? []) {
        const job = parseJob(row);
        if (!job) continue;
        if (new Date(job.enqueuedAt).getTime() > cutoff) continue;
        await redis.lrem(procKey(queue), 1, row);
        await enqueueAlertJob(job.envelope, { delayMs: 0 });
        recovered++;
      }
      return recovered;
    } catch {
      /* memory */
    }
  }
  const mem = ensureMem(queue);
  const keep: QueueJob[] = [];
  for (const job of mem.processing) {
    if (new Date(job.enqueuedAt).getTime() <= cutoff) {
      mem.ready.unshift(job);
      recovered++;
    } else {
      keep.push(job);
    }
  }
  mem.processing = keep;
  return recovered;
}

export async function getQueueDepths(): Promise<
  Record<AlertQueueClass, { ready: number; processing: number; dlq: number }>
> {
  const out = {} as Record<
    AlertQueueClass,
    { ready: number; processing: number; dlq: number }
  >;
  const redis = getRedis();
  for (const q of ALERT_QUEUE_CLASSES) {
    if (redis) {
      try {
        const [ready, processing, dlq] = await Promise.all([
          redis.llen(readyKey(q)),
          redis.llen(procKey(q)),
          redis.llen(dlqKey(q)),
        ]);
        out[q] = {
          ready: ready ?? 0,
          processing: processing ?? 0,
          dlq: dlq ?? 0,
        };
        continue;
      } catch {
        /* memory */
      }
    }
    const mem = ensureMem(q);
    out[q] = {
      ready: mem.ready.length,
      processing: mem.processing.length,
      dlq: mem.dlq.length,
    };
  }
  return out;
}

export async function listDlq(
  queue: AlertQueueClass,
  limit = 50
): Promise<QueueJob[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(dlqKey(queue), 0, limit - 1);
      return (rows ?? []).map(parseJob).filter((j): j is QueueJob => !!j);
    } catch {
      /* memory */
    }
  }
  return ensureMem(queue).dlq.slice(0, limit);
}

export function __resetQueuesForTests(): void {
  memory.clear();
}
