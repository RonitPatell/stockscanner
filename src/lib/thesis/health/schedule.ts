/**
 * Async Thesis Health re-evaluation scheduler.
 * Never blocks UI request paths with full evaluation work.
 */

import { listActiveThesisIdsForSymbol } from "./context.ts";
import { runThesisHealthEvaluation } from "./run.ts";

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const DEBOUNCE_MS = 750;

function enqueueThesis(thesisId: string, triggerReason: string): void {
  const prev = pending.get(thesisId);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(() => {
    pending.delete(thesisId);
    void runThesisHealthEvaluation({ thesisId, triggerReason }).catch(
      (err) => {
        console.error("[thesis-health] evaluation failed", {
          thesisId,
          triggerReason,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    );
  }, DEBOUNCE_MS);

  // Don't keep the process alive solely for debounce timers in workers.
  if (typeof timer === "object" && "unref" in timer) {
    try {
      timer.unref();
    } catch {
      /* ignore */
    }
  }

  pending.set(thesisId, timer);
}

/** Schedule re-eval for a single thesis (condition edits, etc.). */
export function scheduleThesisHealthForThesis(
  thesisId: string,
  triggerReason: string
): void {
  if (!thesisId) return;
  enqueueThesis(thesisId, triggerReason);
}

/** Fan-out to active theses on a symbol (events / metrics / capital risk). */
export function scheduleThesisHealthForSymbol(
  symbol: string,
  triggerReason: string
): void {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  void listActiveThesisIdsForSymbol(sym)
    .then((ids) => {
      for (const id of ids) {
        enqueueThesis(id, triggerReason);
      }
    })
    .catch((err) => {
      console.error("[thesis-health] symbol fan-out failed", {
        symbol: sym,
        error: err instanceof Error ? err.message : "unknown",
      });
    });
}
