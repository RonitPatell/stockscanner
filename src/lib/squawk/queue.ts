import { decideDedupe, dedupeKey } from "./dedupe.ts";
import { shouldInterrupt } from "./priority.ts";
import type { SquawkQueueState, SquawkUtterance } from "./types.ts";

export function createEmptyQueue(): SquawkQueueState {
  return {
    speaking: null,
    pending: [],
    lastByCluster: {},
    lastByCatalyst: {},
  };
}

export type EnqueueResult = {
  state: SquawkQueueState;
  /** Speak this immediately (may interrupt) */
  speakNow: SquawkUtterance | null;
  /** Cancel current speech */
  interrupt: boolean;
  skipped: boolean;
  reason: string | null;
};

/**
 * Enqueue with dedupe + priority interrupt rules.
 * Interrupt only for higher-priority events.
 */
export function enqueueSquawk(
  state: SquawkQueueState,
  utterance: SquawkUtterance
): EnqueueResult {
  const key = dedupeKey(utterance);
  const prev =
    state.lastByCatalyst[utterance.catalystId] ??
    state.lastByCluster[key] ??
    null;

  const decision = decideDedupe(utterance, prev);
  if (decision.action === "skip_duplicate") {
    return {
      state,
      speakNow: null,
      interrupt: false,
      skipped: true,
      reason: "duplicate",
    };
  }

  const next: SquawkQueueState = {
    ...state,
    pending: [...state.pending],
    lastByCluster: { ...state.lastByCluster },
    lastByCatalyst: { ...state.lastByCatalyst },
  };

  const marked: SquawkUtterance = {
    ...utterance,
    isUpdate: decision.action === "update",
  };
  next.lastByCatalyst[marked.catalystId] = marked;
  next.lastByCluster[key] = marked;

  if (!next.speaking) {
    next.speaking = marked;
    return {
      state: next,
      speakNow: marked,
      interrupt: false,
      skipped: false,
      reason: decision.action === "update" ? "update" : "new",
    };
  }

  if (shouldInterrupt(next.speaking.priority, marked.priority)) {
    // Push current to front of pending, speak higher priority
    next.pending = [next.speaking, ...next.pending.filter((p) => p.id !== marked.id)];
    next.speaking = marked;
    return {
      state: next,
      speakNow: marked,
      interrupt: true,
      skipped: false,
      reason: "interrupt_higher_priority",
    };
  }

  // Same or lower priority — queue (replace pending update for same key)
  next.pending = next.pending.filter(
    (p) =>
      p.catalystId !== marked.catalystId &&
      dedupeKey(p) !== key
  );
  next.pending.push(marked);
  return {
    state: next,
    speakNow: null,
    interrupt: false,
    skipped: false,
    reason: "queued",
  };
}

export function completeCurrent(
  state: SquawkQueueState
): { state: SquawkQueueState; speakNow: SquawkUtterance | null } {
  const pending = [...state.pending];
  const next = pending.shift() ?? null;
  return {
    state: {
      ...state,
      speaking: next,
      pending,
    },
    speakNow: next,
  };
}

export function clearQueue(state: SquawkQueueState): SquawkQueueState {
  return {
    ...state,
    speaking: null,
    pending: [],
  };
}
