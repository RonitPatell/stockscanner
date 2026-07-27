import { TRADER_FEEDBACK_DISCLAIMER } from "./version.ts";
import type {
  DecisionAction,
  MonthlyFactualSummary,
  TraderDecisionRecord,
} from "./types.ts";

function monthKey(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function emptyActionCounts(): Record<DecisionAction, number> {
  return { watched: 0, entered: 0, skipped: 0, ignored: 0 };
}

function bumpAction(
  bucket: Record<DecisionAction, number>,
  action: DecisionAction
): void {
  bucket[action] += 1;
}

/**
 * Monthly factual summary from user records only.
 * No manipulative language. Hypothetical savings only when derived from
 * user-entered entry/exit/size and clearly labelled.
 */
export function buildMonthlyFactualSummary(
  records: TraderDecisionRecord[],
  month: string,
  opts?: {
    /** Distinct catalysts the user was shown/reviewed that month (optional) */
    alertsReviewed?: number;
  }
): MonthlyFactualSummary {
  const inMonth = records.filter((r) => monthKey(r.decidedAt) === month);

  const ages = inMonth
    .map((r) => r.context.catalystAgeMin)
    .filter((x): x is number => x != null && Number.isFinite(x));

  const entered = inMonth.filter((r) => r.action === "entered");
  const enteredExtended = entered.filter(
    (r) => (r.context.reactionStage ?? "").toUpperCase() === "EXTENDED"
  );
  const pctEnteredWhileExtended =
    entered.length > 0
      ? Math.round((enteredExtended.length / entered.length) * 1000) / 1000
      : null;

  const skipped = inMonth.filter((r) => r.action === "skipped");
  const skippedDilution = skipped.filter((r) => r.reason === "dilution");
  const pctSkippedForDilution =
    skipped.length > 0
      ? Math.round((skippedDilution.length / skipped.length) * 1000) / 1000
      : null;

  const byType = new Map<
    string,
    { n: number; byAction: Record<DecisionAction, number> }
  >();
  for (const r of inMonth) {
    const type = r.context.catalystType ?? "unknown";
    let row = byType.get(type);
    if (!row) {
      row = { n: 0, byAction: emptyActionCounts() };
      byType.set(type, row);
    }
    row.n += 1;
    bumpAction(row.byAction, r.action);
  }
  const outcomesByCatalystType = [...byType.entries()]
    .map(([type, v]) => ({ type, n: v.n, byAction: v.byAction }))
    .sort((a, b) => b.n - a.n);

  const byStage = new Map<
    string,
    { n: number; byAction: Record<DecisionAction, number> }
  >();
  for (const r of inMonth) {
    const stage = r.context.reactionStage ?? "unknown";
    let row = byStage.get(stage);
    if (!row) {
      row = { n: 0, byAction: emptyActionCounts() };
      byStage.set(stage, row);
    }
    row.n += 1;
    bumpAction(row.byAction, r.action);
  }
  const outcomesByReactionStage = [...byStage.entries()]
    .map(([stage, v]) => ({ stage, n: v.n, byAction: v.byAction }))
    .sort((a, b) => b.n - a.n);

  let userRecordedNotionalPnl: MonthlyFactualSummary["userRecordedNotionalPnl"] =
    null;
  const pnlSamples: number[] = [];
  for (const r of entered) {
    if (
      r.entryPrice != null &&
      r.exitPrice != null &&
      r.positionSize != null &&
      r.entryPrice > 0 &&
      r.positionSize > 0
    ) {
      const dir = r.side === "short" ? -1 : 1;
      const ret =
        ((r.exitPrice - r.entryPrice) / r.entryPrice) * dir * r.positionSize;
      if (Number.isFinite(ret)) pnlSamples.push(ret);
    }
  }
  if (pnlSamples.length > 0) {
    userRecordedNotionalPnl = {
      label:
        "Sum of notional P&L from your entered entry, exit, and position size only — not brokerage statements, not a TrustTicker performance claim",
      totalPnl: Math.round(pnlSamples.reduce((a, b) => a + b, 0) * 100) / 100,
      sampleSize: pnlSamples.length,
    };
  }

  return {
    month,
    alertsReviewed: opts?.alertsReviewed ?? inMonth.length,
    decisionsRecorded: inMonth.length,
    averageCatalystAgeMin: mean(ages),
    pctEnteredWhileExtended,
    pctSkippedForDilution,
    outcomesByCatalystType,
    outcomesByReactionStage,
    userRecordedNotionalPnl,
    disclaimer: TRADER_FEEDBACK_DISCLAIMER,
  };
}

export function listDecisionMonths(records: TraderDecisionRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const m = monthKey(r.decidedAt);
    if (m) set.add(m);
  }
  return [...set].sort().reverse();
}
