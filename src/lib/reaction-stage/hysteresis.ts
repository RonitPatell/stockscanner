import type { ReactionStage } from "./types.ts";

/**
 * Prevent rapid flapping: stay on previous stage until dwell elapsed,
 * unless moving to UNKNOWN (always allowed) or STALE from recycled language (allowed).
 */
export function applyHysteresis(input: {
  candidate: ReactionStage;
  previous: ReactionStage | null | undefined;
  previousAtMs: number | null | undefined;
  nowMs: number;
  hysteresisMs: number;
  /** Force allow (e.g. recycled disclosure → STALE) */
  force?: boolean;
}): { stage: ReactionStage; flappedSuppressed: boolean } {
  const prev = input.previous ?? null;
  if (!prev || prev === input.candidate) {
    return { stage: input.candidate, flappedSuppressed: false };
  }
  if (input.force || input.candidate === "UNKNOWN") {
    return { stage: input.candidate, flappedSuppressed: false };
  }
  // Always allow escalate to EXTENDED or STALE when force not set? User asked hysteresis for flapping.
  // Allow STALE/EXTENDED upgrades without dwell; suppress EARLY↔ACTIVE flicker.
  const upgrade =
    (prev === "EARLY" && (input.candidate === "ACTIVE" || input.candidate === "EXTENDED" || input.candidate === "STALE")) ||
    (prev === "ACTIVE" && (input.candidate === "EXTENDED" || input.candidate === "STALE")) ||
    (prev === "EXTENDED" && input.candidate === "STALE");
  if (upgrade) {
    return { stage: input.candidate, flappedSuppressed: false };
  }

  const last = input.previousAtMs ?? 0;
  const elapsed = input.nowMs - last;
  if (elapsed < input.hysteresisMs) {
    return { stage: prev, flappedSuppressed: true };
  }
  return { stage: input.candidate, flappedSuppressed: false };
}
