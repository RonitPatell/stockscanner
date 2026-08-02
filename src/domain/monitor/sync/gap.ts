import type { SyncGapReason, SyncResumeMode, SyncResumePlan } from "./types.ts";

/**
 * Plan resume after SSR / reconnect.
 * If the ring cannot cover (afterEventId, hubSequence], require full snapshot.
 */
export function planSyncResume(input: {
  afterEventId: number;
  hubSequence: number;
  ringSequences: number[];
  maxReplay?: number;
}): SyncResumePlan {
  const after = Math.max(0, Math.floor(input.afterEventId));
  const hubSeq = Math.max(0, Math.floor(input.hubSequence));
  const maxReplay = input.maxReplay ?? 256;
  const sorted = [...new Set(input.ringSequences)]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const oldestInRing = sorted.length ? sorted[0]! : null;
  const newestInRing = sorted.length ? sorted[sorted.length - 1]! : null;

  if (after >= hubSeq) {
    return {
      mode: "replay",
      reason: "none",
      afterEventId: after,
      messages: [],
      oldestInRing,
      newestInRing,
      hubSequence: hubSeq,
    };
  }

  // Worker restart / empty ring but hub advanced → cannot replay.
  if (sorted.length === 0 && hubSeq > after) {
    return {
      mode: "full_snapshot",
      reason: "worker_restart",
      afterEventId: after,
      messages: [],
      oldestInRing,
      newestInRing,
      hubSequence: hubSeq,
    };
  }

  // Cursor older than oldest retained event → Redis/ring truncation.
  if (oldestInRing != null && after + 1 < oldestInRing) {
    return {
      mode: "full_snapshot",
      reason: "ring_truncated",
      afterEventId: after,
      messages: [],
      oldestInRing,
      newestInRing,
      hubSequence: hubSeq,
    };
  }

  const wanted: number[] = [];
  for (let s = after + 1; s <= hubSeq; s++) {
    wanted.push(s);
  }

  const ringSet = new Set(sorted);
  const holes = wanted.filter((s) => !ringSet.has(s));
  if (holes.length > 0) {
    // Partial ring coverage — unsafe to stitch; full snapshot.
    return {
      mode: "full_snapshot",
      reason: holes[0]! < (oldestInRing ?? 0) ? "cursor_behind_ring" : "sequence_hole",
      afterEventId: after,
      messages: [],
      oldestInRing,
      newestInRing,
      hubSequence: hubSeq,
    };
  }

  const replaySeqs = wanted.slice(0, maxReplay);
  return {
    mode: "replay",
    reason: "none",
    afterEventId: after,
    messages: replaySeqs.map((sequence) => ({
      sequence,
      id: String(sequence),
    })),
    oldestInRing,
    newestInRing,
    hubSequence: hubSeq,
  };
}

/** Detect a hole when applying a live event after lastApplied. */
export function detectLiveGap(
  lastApplied: number,
  incomingSequence: number
): { gap: boolean; reason: SyncGapReason } {
  if (incomingSequence <= lastApplied) {
    return { gap: false, reason: "none" }; // dup / stale handled elsewhere
  }
  if (incomingSequence === lastApplied + 1) {
    return { gap: false, reason: "none" };
  }
  return { gap: true, reason: "sequence_hole" };
}

export function resumeModeLabel(mode: SyncResumeMode): string {
  return mode === "full_snapshot" ? "full_snapshot" : "replay";
}
