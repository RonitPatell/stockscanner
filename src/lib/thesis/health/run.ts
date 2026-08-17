/**
 * Run Thesis Health for one thesis (load → evaluate → persist).
 */

import { evaluateThesisHealth } from "./evaluate.ts";
import {
  loadThesisForHealth,
  loadThesisHealthContext,
} from "./context.ts";
import { persistThesisHealthEvaluation } from "./persist.ts";
import type { ThesisHealthEvaluationResult } from "./types.ts";

export async function runThesisHealthEvaluation(opts: {
  thesisId: string;
  triggerReason?: string;
  now?: Date;
}): Promise<
  | { ok: true; result: ThesisHealthEvaluationResult; evaluationId: string }
  | { ok: false; code: "NOT_FOUND" | "SKIPPED"; error: string }
> {
  const thesis = await loadThesisForHealth(opts.thesisId);
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  if (thesis.status === "archived") {
    return { ok: false, code: "SKIPPED", error: "Thesis is archived" };
  }

  const context = await loadThesisHealthContext(
    thesis,
    opts.now ?? new Date()
  );
  const result = evaluateThesisHealth({
    conditions: thesis.conditions,
    context,
  });
  const { evaluationId } = await persistThesisHealthEvaluation({
    thesisId: thesis.id,
    result,
    triggerReason: opts.triggerReason,
  });

  return { ok: true, result, evaluationId };
}
