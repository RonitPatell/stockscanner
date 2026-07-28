import type { CatalystItem } from "@/types";
import { rankForFocusMode } from "../focus-mode/rank.ts";

/**
 * Reorder by Focus ranking without capping the list.
 * Presentation hierarchy only — never predicted profitability.
 */
export function orderByFocusRank(
  items: CatalystItem[],
  opts: {
    watchlist: Set<string> | string[];
    nowMs?: number;
    ruleMatchedIds?: Set<string>;
  }
): CatalystItem[] {
  const ranked = rankForFocusMode(items, opts);
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: CatalystItem[] = [];
  for (const r of ranked) {
    const c = byId.get(r.catalystId);
    if (c) out.push(c);
  }
  return out;
}
