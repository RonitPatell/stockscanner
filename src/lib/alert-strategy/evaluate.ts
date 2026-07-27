import { evaluateCondition } from "./conditions.ts";
import { evaluateAlertMode } from "../alerts/modes.ts";
import type { CatalystItem } from "@/types";
import type {
  AlertStrategy,
  ConditionEvalDetail,
  StrategyConditionGroup,
  StrategyEvalFacts,
  StrategyEvalResult,
  StrategyMute,
} from "./types.ts";

function evalGroup(
  group: StrategyConditionGroup,
  facts: StrategyEvalFacts
): { passed: boolean; details: ConditionEvalDetail[] } {
  const details: ConditionEvalDetail[] = [];
  const condResults = group.conditions.map((c) => {
    const d = evaluateCondition(c, facts);
    details.push(d);
    return d.passed;
  });

  const nested = (group.groups ?? []).map((g) => evalGroup(g, facts));
  for (const n of nested) details.push(...n.details);

  const parts = [...condResults, ...nested.map((n) => n.passed)];
  if (parts.length === 0) {
    return { passed: true, details };
  }
  const passed =
    group.logic === "AND" ? parts.every(Boolean) : parts.some(Boolean);
  return { passed, details };
}

export function isMuteActive(
  mute: StrategyMute | null | undefined,
  facts: StrategyEvalFacts,
  nowMs = Date.now()
): { muted: boolean; reason: string | null } {
  if (!mute) return { muted: false, reason: null };
  if (mute.until) {
    const t = Date.parse(mute.until);
    if (Number.isFinite(t) && nowMs > t) return { muted: false, reason: null };
  }
  const sym = facts.symbol.toUpperCase();
  if (mute.tickers?.some((t) => t.toUpperCase() === sym)) {
    return { muted: true, reason: `Ticker ${sym} temporarily muted` };
  }
  if (
    mute.categories?.length &&
    facts.catalystCategory &&
    mute.categories.some(
      (c) => c.toLowerCase() === facts.catalystCategory!.toLowerCase()
    )
  ) {
    return {
      muted: true,
      reason: `Category ${facts.catalystCategory} temporarily muted`,
    };
  }
  if (
    mute.sessions?.length &&
    facts.marketSession &&
    mute.sessions.includes(
      facts.marketSession as "premarket" | "regular" | "afterhours" | "weekend"
    )
  ) {
    return {
      muted: true,
      reason: `Session ${facts.marketSession} temporarily muted`,
    };
  }
  return { muted: false, reason: null };
}

/**
 * Evaluate strategy condition tree + delivery behaviour.
 * Delivery modes reuse existing EARLY/CONFIRMED/RISK_ONLY semantics.
 */
export function evaluateStrategy(
  strategy: AlertStrategy,
  facts: StrategyEvalFacts,
  catalyst?: CatalystItem | null,
  opts?: { nowMs?: number; skipDeliveryMode?: boolean }
): StrategyEvalResult {
  if (!strategy.enabled) {
    return {
      matched: false,
      delivery: strategy.delivery,
      details: [],
      blockedByMute: false,
      muteReason: null,
      summary: "Strategy disabled",
    };
  }

  const mute = isMuteActive(strategy.mutes, facts, opts?.nowMs);
  if (mute.muted) {
    return {
      matched: false,
      delivery: strategy.delivery,
      details: [],
      blockedByMute: true,
      muteReason: mute.reason,
      summary: mute.reason ?? "Muted",
    };
  }

  const { passed, details } = evalGroup(strategy.root, facts);
  let matched = passed;

  if (matched && !opts?.skipDeliveryMode && catalyst) {
    const modeEval = evaluateAlertMode(strategy.delivery, catalyst, {
      changePercent: facts.pctMove,
      rVol: facts.relativeVolume,
      spreadPct:
        facts.spreadBps != null ? facts.spreadBps / 100 : null,
      dollarVolume: facts.dollarVolume,
    });
    if (!modeEval.wouldFire) {
      matched = false;
      for (const b of modeEval.blocked) {
        details.push({
          conditionId: `delivery_${b.id}`,
          field: "catalyst_category",
          op: "eq",
          passed: false,
          actual: "blocked",
          expected: strategy.delivery,
          detail: `${b.label}: ${b.detail ?? "blocked by delivery mode"}`,
        });
      }
    } else {
      for (const t of modeEval.triggered) {
        details.push({
          conditionId: `delivery_${t.id}`,
          field: "catalyst_category",
          op: "eq",
          passed: true,
          actual: "triggered",
          expected: strategy.delivery,
          detail: `${t.label}: ${t.detail ?? "ok"}`,
        });
      }
    }
  }

  return {
    matched,
    delivery: strategy.delivery,
    details,
    blockedByMute: false,
    muteReason: null,
    summary: matched
      ? `Matched ${strategy.delivery} strategy “${strategy.name}”`
      : `Did not match “${strategy.name}”`,
  };
}

export function factsFromCatalyst(
  c: {
    symbol: string;
    price?: number | null;
    floatShares?: number | null;
    catalystType?: string | null;
    sourceTier?: string | null;
    newsCount?: number | null;
    rVol?: number | null;
    changePercent?: number | null;
    volume?: number | null;
    publishedAt?: string;
    judgmentV2?: { catalystStrength?: string } | null;
  },
  extras?: Partial<StrategyEvalFacts>
): StrategyEvalFacts {
  const floatM =
    c.floatShares != null && c.floatShares > 0 ? c.floatShares / 1e6 : null;
  const dollarVolume =
    c.price != null && c.volume != null && c.price > 0 && c.volume > 0
      ? c.price * c.volume
      : null;
  const ageMin =
    c.publishedAt && Number.isFinite(Date.parse(c.publishedAt))
      ? (Date.now() - Date.parse(c.publishedAt)) / 60_000
      : null;

  return {
    symbol: c.symbol.toUpperCase(),
    onWatchlist: extras?.onWatchlist ?? false,
    price: c.price ?? null,
    floatM,
    floatConfidence: extras?.floatConfidence ?? null,
    catalystCategory: c.catalystType ?? null,
    sourceTier: c.sourceTier ?? null,
    confirmationCount: c.newsCount ?? extras?.confirmationCount ?? null,
    catalystStrength: c.judgmentV2?.catalystStrength ?? extras?.catalystStrength ?? null,
    reactionStage: extras?.reactionStage ?? null,
    relativeVolume: c.rVol ?? null,
    dollarVolume: extras?.dollarVolume ?? dollarVolume,
    pctMove: c.changePercent ?? null,
    spreadBps: extras?.spreadBps ?? null,
    tradeability: extras?.tradeability ?? null,
    dilutionFlags: extras?.dilutionFlags ?? [],
    marketSession: extras?.marketSession ?? null,
    haltStatus: extras?.haltStatus ?? null,
    catalystAgeMin: ageMin,
    sector: extras?.sector ?? null,
    exchange: extras?.exchange ?? null,
    headline: extras?.headline ?? null,
    summary: extras?.summary ?? null,
    verifiedConfidence: extras?.verifiedConfidence ?? null,
  };
}
