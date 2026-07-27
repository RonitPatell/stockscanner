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
 * Factors: user rule/watchlist match, freshness, materiality (urgency/confidence/move).
 * Explicitly does NOT rank by predicted profitability.
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

    const onWl = watch.has(c.symbol.toUpperCase());
    if (onWl) {
      score += 40;
      reasons.push("watchlist_match");
    }
    if (ruleIds.has(c.id)) {
      score += 35;
      reasons.push("rule_hint");
    }

    const pub = Date.parse(c.publishedAt);
    const ageMin = Number.isFinite(pub) ? (now - pub) / 60_000 : 999;
    if (ageMin <= 15) {
      score += 30;
      reasons.push("fresh");
    } else if (ageMin <= 60) {
      score += 15;
      reasons.push("fresh");
    } else if (ageMin <= 180) {
      score += 5;
    }

    // Materiality — observable market/news intensity, not predicted P&L
    const urgency = c.urgencyScore ?? 0;
    const conf = c.verifiedConfidence ?? 0;
    const absMove = Math.abs(c.changePercent ?? 0);
    const materialPts =
      Math.min(25, urgency / 4) +
      Math.min(15, conf / 5) +
      Math.min(15, absMove);
    if (materialPts >= 20) reasons.push("material");
    score += materialPts;

    if ((c.judgmentV2?.riskFlags?.length ?? 0) > 0 || /offering|dilution/i.test(c.catalystType ?? "")) {
      score += 12;
      reasons.push("risk");
    }
    if (conf >= 70) {
      score += 8;
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
