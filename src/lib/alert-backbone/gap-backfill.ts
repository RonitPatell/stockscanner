import { getRedis } from "../redis.ts";
import { enqueueAlertJob } from "./queues.ts";
import { getSourceHeartbeat, recordSourceHeartbeat } from "./heartbeats.ts";
import type { AlertEventEnvelope, AlertQueueClass } from "./types.ts";

const CURSOR_PREFIX = "alertbb:cursor:";
const memoryCursors = new Map<string, string>();

export async function getSourceCursor(sourceId: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<string>(CURSOR_PREFIX + sourceId);
      if (typeof v === "string") return v;
    } catch {
      /* memory */
    }
  }
  return memoryCursors.get(sourceId) ?? null;
}

export async function setSourceCursor(
  sourceId: string,
  cursor: string
): Promise<void> {
  memoryCursors.set(sourceId, cursor);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(CURSOR_PREFIX + sourceId, cursor, { ex: 7 * 24 * 3600 });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Detect connection gaps and enqueue recovery-poll backfill markers.
 * Polling is used only as recovery after a disconnected stream (or missed heartbeat).
 */
export async function detectAndBackfillGap(input: {
  sourceId: string;
  provider: string;
  newCursor: string;
  expectedIntervalMs?: number;
  connectionMode?: "stream" | "poll" | "recovery_poll";
  /** Optional synthetic envelope to mark gap recovery work. */
  backfillEnvelope?: Omit<AlertEventEnvelope, "queue"> & { queue?: AlertQueueClass };
}): Promise<{ gap: boolean; enqueued: boolean }> {
  const prev = await getSourceCursor(input.sourceId);
  const hb = await recordSourceHeartbeat({
    sourceId: input.sourceId,
    provider: input.provider,
    cursor: input.newCursor,
    expectedIntervalMs: input.expectedIntervalMs,
    connectionMode: input.connectionMode ?? (prev ? "stream" : "poll"),
  });

  await setSourceCursor(input.sourceId, input.newCursor);

  const gap =
    hb.gapDetected ||
    (prev != null && prev !== input.newCursor && hb.consecutiveMisses > 0);

  if (!gap) return { gap: false, enqueued: false };

  // Switch mode to recovery poll until next successful continuous beat
  await recordSourceHeartbeat({
    sourceId: input.sourceId,
    provider: input.provider,
    cursor: input.newCursor,
    connectionMode: "recovery_poll",
    expectedIntervalMs: input.expectedIntervalMs,
  });

  if (input.backfillEnvelope) {
    await enqueueAlertJob({
      ...input.backfillEnvelope,
      queue: input.backfillEnvelope.queue ?? "enrichment",
      phase: input.backfillEnvelope.phase ?? "preliminary",
      headline: `[backfill] ${input.backfillEnvelope.headline}`,
    });
    return { gap: true, enqueued: true };
  }

  return { gap: true, enqueued: false };
}

export function __resetCursorsForTests(): void {
  memoryCursors.clear();
}
