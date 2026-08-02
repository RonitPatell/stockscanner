/**
 * Bounded replay reprocess — always creates a *derived* session id.
 * Source frames are never mutated (no silent historical rewrites).
 */

import type { MonitorReplayFrame, MonitorReplaySession } from "@/domain/monitor/replay";
import { getReplaySession, saveReplaySession } from "@/lib/monitor/replay-registry";

export const MAX_REPROCESS_WINDOW_MS = 15 * 60_000;
export const MAX_REPROCESS_FRAMES = 2_000;

export class ReprocessBoundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReprocessBoundsError";
  }
}

export interface ReprocessResult {
  sourceSessionId: string;
  derivedSessionId: string;
  fromMs: number;
  toMs: number;
  frameCount: number;
  note: string;
}

export async function reprocessBoundedReplayWindow(input: {
  sessionId: string;
  fromMs: number;
  toMs: number;
  actorUserId: string;
}): Promise<ReprocessResult> {
  const fromMs = Number(input.fromMs);
  const toMs = Number(input.toMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new ReprocessBoundsError("invalid_window");
  }
  if (toMs - fromMs > MAX_REPROCESS_WINDOW_MS) {
    throw new ReprocessBoundsError(
      `window_too_large_max_${MAX_REPROCESS_WINDOW_MS}ms`
    );
  }

  const source = await getReplaySession(input.sessionId);
  if (!source) throw new ReprocessBoundsError("session_not_found");

  const sliced = source.frames
    .filter((f) => f.asOfMs >= fromMs && f.asOfMs <= toMs)
    .slice(0, MAX_REPROCESS_FRAMES);

  if (sliced.length === 0) {
    throw new ReprocessBoundsError("empty_window");
  }

  // Derived copy — new session id. Original frames/session untouched.
  const derivedId = `reprocess_${source.id}_${fromMs}_${toMs}_${Date.now().toString(36)}`.slice(
    0,
    120
  );
  const derivedAtMs = Date.now();
  const derivedFrames: MonitorReplayFrame[] = sliced.map((f, i) => ({
    ...f,
    rawRefs: [
      ...(f.rawRefs ?? []),
      {
        source: "ops_reprocess",
        eventId: `${source.id}:${i}`,
        observedAtMs: derivedAtMs,
      },
    ],
  }));

  const derived: MonitorReplaySession = {
    ...source,
    id: derivedId,
    createdAtMs: derivedAtMs,
    frames: derivedFrames,
    fromMs: derivedFrames[0]!.asOfMs,
    toMs: derivedFrames[derivedFrames.length - 1]!.asOfMs,
    meta: {
      ...source.meta,
      note: `Derived reprocess by ${input.actorUserId}; source ${source.id} immutable. ${source.meta?.note ?? ""}`.trim(),
    },
  };

  await saveReplaySession(derived);

  return {
    sourceSessionId: source.id,
    derivedSessionId: derivedId,
    fromMs: derived.fromMs,
    toMs: derived.toMs,
    frameCount: derivedFrames.length,
    note: "Derived session created. Source replay frames were not modified.",
  };
}
