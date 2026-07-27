import { TRADER_FEEDBACK_VERSION } from "./version.ts";
import type {
  DecisionAction,
  DecisionContextSnapshot,
  DecisionReason,
  TraderDecisionRecord,
} from "./types.ts";

function id(): string {
  return `td_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyContext(
  over?: Partial<DecisionContextSnapshot>
): DecisionContextSnapshot {
  return {
    catalystAgeMin: null,
    reactionStage: null,
    tradeability: null,
    risksVisible: [],
    moveCompletedBeforeEntryPct: null,
    priceAtDecision: null,
    publishedAt: null,
    catalystType: null,
    alertRuleId: null,
    alertStrategyId: null,
    alertStrategyVersion: null,
    followedOwnRules: null,
    missingInformation: [],
    ...over,
  };
}

export function createDecisionRecord(input: {
  action: DecisionAction;
  symbol: string;
  catalystId?: string | null;
  headline?: string | null;
  reason?: DecisionReason | null;
  reasonNote?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  positionSize?: number | null;
  side?: "long" | "short" | null;
  alertId?: string | null;
  alertRuleId?: string | null;
  alertStrategyId?: string | null;
  context?: Partial<DecisionContextSnapshot>;
  decidedAt?: string;
}): TraderDecisionRecord {
  const now = input.decidedAt ?? new Date().toISOString();
  const context = emptyContext(input.context);
  if (!context.missingInformation.length) {
    context.missingInformation = inferMissing(context, input);
  }
  return {
    id: id(),
    schemaVersion: TRADER_FEEDBACK_VERSION,
    action: input.action,
    reason: input.reason ?? null,
    reasonNote: input.reasonNote?.slice(0, 200) ?? null,
    catalystId: input.catalystId ?? null,
    symbol: input.symbol.toUpperCase(),
    headline: input.headline?.slice(0, 240) ?? null,
    decidedAt: now,
    entryPrice: numOrNull(input.entryPrice),
    exitPrice: numOrNull(input.exitPrice),
    positionSize: numOrNull(input.positionSize),
    side: input.side ?? null,
    alertId: input.alertId ?? null,
    alertRuleId: input.alertRuleId ?? context.alertRuleId,
    alertStrategyId: input.alertStrategyId ?? context.alertStrategyId,
    context,
    mfePctAfter: null,
    maePctAfter: null,
    syncState: "local",
    updatedAt: now,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function inferMissing(
  ctx: DecisionContextSnapshot,
  input: { entryPrice?: number | null; action: DecisionAction }
): string[] {
  const miss: string[] = [];
  if (ctx.reactionStage == null) miss.push("reaction_stage");
  if (ctx.tradeability == null) miss.push("tradeability");
  if (ctx.catalystAgeMin == null) miss.push("catalyst_age");
  if (input.action === "entered" && input.entryPrice == null) {
    miss.push("entry_price");
  }
  if (ctx.followedOwnRules == null) miss.push("rule_follow_status");
  return miss;
}

export function parseDecisionRecord(raw: unknown): TraderDecisionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (
    action !== "watched" &&
    action !== "entered" &&
    action !== "skipped" &&
    action !== "ignored"
  ) {
    return null;
  }
  const symbol = typeof o.symbol === "string" ? o.symbol.toUpperCase() : null;
  if (!symbol) return null;
  const ctxRaw =
    o.context && typeof o.context === "object"
      ? (o.context as Record<string, unknown>)
      : {};
  const reasons = [
    "catalyst_quality",
    "dilution",
    "spread",
    "extension",
    "halt",
    "setup_mismatch",
    "other",
  ] as const;
  const reason = reasons.includes(o.reason as DecisionReason)
    ? (o.reason as DecisionReason)
    : null;

  return {
    id: typeof o.id === "string" ? o.id : id(),
    schemaVersion:
      typeof o.schemaVersion === "string"
        ? o.schemaVersion
        : TRADER_FEEDBACK_VERSION,
    action,
    reason,
    reasonNote: typeof o.reasonNote === "string" ? o.reasonNote.slice(0, 200) : null,
    catalystId: typeof o.catalystId === "string" ? o.catalystId : null,
    symbol,
    headline: typeof o.headline === "string" ? o.headline.slice(0, 240) : null,
    decidedAt:
      typeof o.decidedAt === "string" ? o.decidedAt : new Date().toISOString(),
    entryPrice: numOrNull(o.entryPrice),
    exitPrice: numOrNull(o.exitPrice),
    positionSize: numOrNull(o.positionSize),
    side: o.side === "long" || o.side === "short" ? o.side : null,
    alertId: typeof o.alertId === "string" ? o.alertId : null,
    alertRuleId: typeof o.alertRuleId === "string" ? o.alertRuleId : null,
    alertStrategyId:
      typeof o.alertStrategyId === "string" ? o.alertStrategyId : null,
    context: emptyContext({
      catalystAgeMin: numOrNull(ctxRaw.catalystAgeMin),
      reactionStage:
        typeof ctxRaw.reactionStage === "string" ? ctxRaw.reactionStage : null,
      tradeability:
        typeof ctxRaw.tradeability === "string" ? ctxRaw.tradeability : null,
      risksVisible: Array.isArray(ctxRaw.risksVisible)
        ? ctxRaw.risksVisible.map(String)
        : [],
      moveCompletedBeforeEntryPct: numOrNull(ctxRaw.moveCompletedBeforeEntryPct),
      priceAtDecision: numOrNull(ctxRaw.priceAtDecision),
      publishedAt:
        typeof ctxRaw.publishedAt === "string" ? ctxRaw.publishedAt : null,
      catalystType:
        typeof ctxRaw.catalystType === "string" ? ctxRaw.catalystType : null,
      alertRuleId:
        typeof ctxRaw.alertRuleId === "string" ? ctxRaw.alertRuleId : null,
      alertStrategyId:
        typeof ctxRaw.alertStrategyId === "string"
          ? ctxRaw.alertStrategyId
          : null,
      alertStrategyVersion: numOrNull(ctxRaw.alertStrategyVersion),
      followedOwnRules:
        typeof ctxRaw.followedOwnRules === "boolean"
          ? ctxRaw.followedOwnRules
          : null,
      missingInformation: Array.isArray(ctxRaw.missingInformation)
        ? ctxRaw.missingInformation.map(String)
        : [],
    }),
    mfePctAfter: numOrNull(o.mfePctAfter),
    maePctAfter: numOrNull(o.maePctAfter),
    syncState:
      o.syncState === "pending" || o.syncState === "synced"
        ? o.syncState
        : "local",
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}
