/**
 * Compare consecutive thesis evaluations → condition state changes.
 */

import type {
  BriefThesisEvalCondition,
  BriefThesisSnapshot,
  PortfolioBriefThesisChange,
} from "./types.ts";

function stateOf(
  c: BriefThesisEvalCondition | undefined
): string | null {
  if (!c || c.mode === "manual") return null;
  return c.state;
}

/**
 * Diff previous → latest evaluation per thesis.
 * Conflicts: toState FAIL, or invalidate_if with WARN/FAIL.
 */
export function diffThesisEvaluations(opts: {
  latest: BriefThesisSnapshot[];
  previousByThesisId: Map<string, BriefThesisSnapshot>;
}): PortfolioBriefThesisChange[] {
  const out: PortfolioBriefThesisChange[] = [];

  for (const latest of opts.latest) {
    const prev = opts.previousByThesisId.get(latest.thesisId);
    const prevById = new Map(
      (prev?.conditions ?? []).map((c) => [c.conditionId, c])
    );

    for (const c of latest.conditions) {
      if (c.mode === "manual") continue;
      const toState = stateOf(c);
      if (!toState || toState === "UNKNOWN") continue;

      const fromState = stateOf(prevById.get(c.conditionId));
      if (fromState === toState) continue;
      // Only surface meaningful transitions (ignore first-seen UNKNOWN→PASS noise unless FAIL/WARN)
      if (fromState == null && toState === "PASS") continue;

      const isConflict =
        toState === "FAIL" ||
        (c.polarity === "invalidate_if" &&
          (toState === "FAIL" || toState === "WARN")) ||
        (fromState === "PASS" && (toState === "WARN" || toState === "FAIL"));

      out.push({
        thesisId: latest.thesisId,
        symbol: latest.symbol,
        conditionId: c.conditionId,
        conditionLabel: c.label,
        polarity: c.polarity,
        fromState,
        toState,
        isConflict,
        evaluatedAt: latest.evaluatedAt,
        explanation: c.explanation ?? null,
      });
    }
  }

  // Conflicts first, then symbol
  out.sort((a, b) => {
    if (a.isConflict !== b.isConflict) return a.isConflict ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  return out;
}
