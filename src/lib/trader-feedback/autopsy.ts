import { TRADER_FEEDBACK_DISCLAIMER } from "./version.ts";
import type {
  CatalystAutopsy,
  DecisionAction,
  TraderDecisionRecord,
} from "./types.ts";

/**
 * Build a catalyst autopsy from a decision record + optional peer history.
 * Descriptive only — no “TrustTicker made you money” framing.
 */
export function buildCatalystAutopsy(
  record: TraderDecisionRecord,
  allRecords: TraderDecisionRecord[],
  opts?: {
    /** Outcome MFE/MAE after decision (from calibration or user exit path) */
    mfePctAfter?: number | null;
    maePctAfter?: number | null;
  }
): CatalystAutopsy {
  const similar = findSimilarPastDecisions(record, allRecords).slice(0, 5);
  const missing = [...record.context.missingInformation];
  if (record.mfePctAfter == null && opts?.mfePctAfter == null) {
    if (!missing.includes("post_decision_excursion")) {
      missing.push("post_decision_excursion");
    }
  }

  return {
    recordId: record.id,
    symbol: record.symbol,
    action: record.action,
    decidedAt: record.decidedAt,
    catalystAgeMin: record.context.catalystAgeMin,
    reactionStageAtDecision: record.context.reactionStage,
    tradeabilityAtDecision: record.context.tradeability,
    risksVisibleAtDecision: [...record.context.risksVisible],
    moveCompletedBeforeEntryPct: record.context.moveCompletedBeforeEntryPct,
    mfePctAfter: opts?.mfePctAfter ?? record.mfePctAfter,
    maePctAfter: opts?.maePctAfter ?? record.maePctAfter,
    followedOwnAlertRules: record.context.followedOwnRules,
    similarPastDecisions: similar.map((s) => ({
      id: s.id,
      action: s.action,
      reason: s.reason,
      decidedAt: s.decidedAt,
      symbol: s.symbol,
    })),
    missingInformation: missing,
    disclaimer: TRADER_FEEDBACK_DISCLAIMER,
  };
}

export function findSimilarPastDecisions(
  record: TraderDecisionRecord,
  all: TraderDecisionRecord[]
): TraderDecisionRecord[] {
  return all
    .filter((r) => r.id !== record.id)
    .filter((r) => Date.parse(r.decidedAt) < Date.parse(record.decidedAt))
    .map((r) => ({
      r,
      score:
        (r.symbol === record.symbol ? 3 : 0) +
        (r.action === record.action ? 2 : 0) +
        (r.reason && r.reason === record.reason ? 2 : 0) +
        (r.context.reactionStage &&
        r.context.reactionStage === record.context.reactionStage
          ? 1
          : 0),
    }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || b.r.decidedAt.localeCompare(a.r.decidedAt))
    .map((x) => x.r);
}

/** Attach user-entered MFE/MAE from exit vs entry when both present. */
export function deriveUserExcursion(
  record: TraderDecisionRecord
): { mfePct: number | null; maePct: number | null } {
  if (
    record.action !== "entered" ||
    record.entryPrice == null ||
    record.exitPrice == null ||
    !(record.entryPrice > 0)
  ) {
    return { mfePct: null, maePct: null };
  }
  const dir = record.side === "short" ? -1 : 1;
  const pct =
    ((record.exitPrice - record.entryPrice) / record.entryPrice) * 100 * dir;
  // Single exit point — favourable if positive, adverse if negative
  return {
    mfePct: pct > 0 ? Math.round(pct * 100) / 100 : 0,
    maePct: pct < 0 ? Math.round(pct * 100) / 100 : 0,
  };
}

export function actionLabel(a: DecisionAction): string {
  switch (a) {
    case "watched":
      return "Watched";
    case "entered":
      return "Entered";
    case "skipped":
      return "Skipped";
    case "ignored":
      return "Ignored";
  }
}
