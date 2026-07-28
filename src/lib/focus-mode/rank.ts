import type { CatalystItem } from "@/types";
import { FOCUS_MODE_VERSION } from "../squawk/version.ts";

export { FOCUS_MODE_VERSION };

export const FOCUS_MAX_ACTIVE = 5;

export type FocusRankReason =
  | "watchlist_match"
  | "rule_hint"
  | "fresh"
  | "material"
  | "risk"
  | "verified";

export interface FocusRankResult {
  catalystId: string;
  symbol: string;
  score: number;
  reasons: FocusRankReason[];
  /** Never used for ranking */
  profitabilityNotUsed: true;
}

/**
 * Rank catalysts for Focus Mode.
 * Priority order (never predicted profitability):
 * 1. User alert-strategy match
 * 2. Watchlist match
 * 3. Materiality
 * 4. Freshness
 * 5. Risk severity
 */
export function rankForFocusMode(
  items: CatalystItem[],
  opts: {
    watchlist: Set<string> | string[];
    nowMs?: number;
    /** Optional set of catalyst ids that matched user alert rules/strategies */
    ruleMatchedIds?: Set<string>;
  }
): FocusRankResult[] {
  const now = opts.nowMs ?? Date.now();
  const watch = opts.watchlist instanceof Set
    ? opts.watchlist
    : new Set(opts.watchlist.map((s) => s.toUpperCase()));
  const ruleIds = opts.ruleMatchedIds ?? new Set();

  const ranked = items.map((c) => {
    const reasons: FocusRankReason[] = [];
    let score = 0;

    // 1. Alert-strategy match (highest)
    if (ruleIds.has(c.id)) {
      score += 100;
      reasons.push("rule_hint");
    }

    // 2. Watchlist match
    const onWl = watch.has(c.symbol.toUpperCase());
    if (onWl) {
      score += 70;
      reasons.push("watchlist_match");
    }

    // 3. Materiality — observable intensity, not predicted P&L
    const urgency = c.urgencyScore ?? 0;
    const conf = c.verifiedConfidence ?? 0;
    const absMove = Math.abs(c.changePercent ?? 0);
    const materialPts =
      Math.min(25, urgency / 4) +
      Math.min(15, conf / 5) +
      Math.min(20, absMove);
    score += materialPts;
    if (materialPts >= 20) reasons.push("material");

    // 4. Freshness
    const pub = Date.parse(c.publishedAt);
    const ageMin = Number.isFinite(pub) ? (now - pub) / 60_000 : 999;
    if (ageMin <= 15) {
      score += 40;
      reasons.push("fresh");
    } else if (ageMin <= 60) {
      score += 22;
      reasons.push("fresh");
    } else if (ageMin <= 180) {
      score += 8;
      reasons.push("fresh");
    }

    // 5. Risk severity
    const flags = c.judgmentV2?.riskFlags ?? [];
    let riskPts = 0;
    for (const f of flags) {
      if (f.severity === "high") riskPts = Math.max(riskPts, 18);
      else if (f.severity === "medium") riskPts = Math.max(riskPts, 10);
      else riskPts = Math.max(riskPts, 4);
    }
    if (
      riskPts === 0 &&
      /offering|dilution/i.test(c.catalystType ?? "")
    ) {
      riskPts = 10;
    }
    if (riskPts > 0) {
      score += riskPts;
      reasons.push("risk");
    }

    if (conf >= 70) {
      score += 6;
      reasons.push("verified");
    }

    return {
      catalystId: c.id,
      symbol: c.symbol,
      score,
      reasons,
      profitabilityNotUsed: true as const,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

export function selectFocusActive(
  items: CatalystItem[],
  opts: Parameters<typeof rankForFocusMode>[1]
): CatalystItem[] {
  const ranked = rankForFocusMode(items, opts);
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: CatalystItem[] = [];
  for (const r of ranked) {
    const c = byId.get(r.catalystId);
    if (c) out.push(c);
    if (out.length >= FOCUS_MAX_ACTIVE) break;
  }
  return out;
}

/**
 * Focus Mode V2 — never pad with low-quality events to reach five.
 * Qualifies only if: strategy match, watchlist, material reason, critical risk,
 * or score meets the priority floor.
 */
export const FOCUS_PRIORITY_SCORE_FLOOR = 55;

export function qualifiesForFocusPriority(r: FocusRankResult): boolean {
  if (r.reasons.includes("rule_hint")) return true;
  if (r.reasons.includes("watchlist_match")) return true;
  if (r.reasons.includes("material")) return true;
  if (r.reasons.includes("risk") && r.score >= FOCUS_PRIORITY_SCORE_FLOOR) {
    return true;
  }
  return r.score >= FOCUS_PRIORITY_SCORE_FLOOR;
}

export function selectFocusPriority(
  items: CatalystItem[],
  opts: Parameters<typeof rankForFocusMode>[1]
): CatalystItem[] {
  const ranked = rankForFocusMode(items, opts);
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: CatalystItem[] = [];
  for (const r of ranked) {
    if (!qualifiesForFocusPriority(r)) continue;
    const c = byId.get(r.catalystId);
    if (c) out.push(c);
    if (out.length >= FOCUS_MAX_ACTIVE) break;
  }
  return out;
}
