import {
  LADDER_REORDER_MS,
  LADDER_TOP_N,
  type PriorityLadderRow,
} from "./ladder-types.ts";

export interface OrderState {
  /** Display order of symbols (rank order). */
  order: string[];
  lastReorderAt: number;
  /** Previous display ranks for change indicators. */
  previousRanks: Map<string, number>;
  /** Signature of critical/halted symbols at last force-reorder. */
  criticalKey: string;
}

export function createOrderState(): OrderState {
  return {
    order: [],
    lastReorderAt: 0,
    previousRanks: new Map(),
    criticalKey: "",
  };
}

function sortByAttention(rows: PriorityLadderRow[]): PriorityLadderRow[] {
  return [...rows].sort((a, b) => {
    if (b.attentionPriority !== a.attentionPriority) {
      return b.attentionPriority - a.attentionPriority;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Apply live scores frequently, reorder only on cadence unless critical.
 * Returns display rows (top 10) with stable rank until reorder fires.
 */
export function projectLadderDisplay(
  liveRows: PriorityLadderRow[],
  state: OrderState,
  nowMs: number,
  opts?: { reorderMs?: number; topN?: number }
): { rows: PriorityLadderRow[]; state: OrderState; reordered: boolean; criticalAnnouncements: string[] } {
  const reorderMs = opts?.reorderMs ?? LADDER_REORDER_MS;
  const topN = opts?.topN ?? LADDER_TOP_N;
  const liveSorted = sortByAttention(liveRows);
  const liveTop = liveSorted.slice(0, topN);
  const bySym = new Map(liveRows.map((r) => [r.symbol, r] as const));

  // Force-reorder only when the critical/halted set changes — not every tick
  // while a name stays halted (that caused constant reshuffles + update storms).
  const criticalKey = liveTop
    .filter((r) => r.criticalEvent || r.halted)
    .map((r) => r.symbol)
    .sort()
    .join(",");
  const criticalChanged =
    criticalKey.length > 0 && criticalKey !== state.criticalKey;
  const due = nowMs - state.lastReorderAt >= reorderMs;
  const first = state.order.length === 0;

  let reordered = false;
  let order = state.order;
  const announcements: string[] = [];

  if (first || due || criticalChanged) {
    const nextOrder = liveTop.map((r) => r.symbol);
    // Announce only critical / large rank jumps on reorder.
    if (!first) {
      for (let i = 0; i < nextOrder.length; i++) {
        const sym = nextOrder[i]!;
        const prevRank = state.previousRanks.get(sym);
        const newRank = i + 1;
        const row = bySym.get(sym);
        if (prevRank != null && prevRank !== newRank) {
          const jump = prevRank - newRank;
          if (row?.criticalEvent || row?.halted || Math.abs(jump) >= 3) {
            announcements.push(
              `${sym} moved from rank ${prevRank} to rank ${newRank}`
            );
          }
        }
      }
    }
    order = nextOrder;
    reordered = !first && (due || criticalChanged);
  }

  // Drop symbols no longer in live set; append new ones at end until next reorder.
  const liveSet = new Set(liveTop.map((r) => r.symbol));
  order = order.filter((s) => liveSet.has(s));
  for (const r of liveTop) {
    if (!order.includes(r.symbol)) order.push(r.symbol);
  }
  order = order.slice(0, topN);

  const prevRanks = new Map(state.previousRanks);
  const rows: PriorityLadderRow[] = order.map((sym, i) => {
    const live = bySym.get(sym)!;
    const rank = i + 1;
    const previousRank = prevRanks.has(sym) ? prevRanks.get(sym)! : null;
    return {
      ...live,
      rank,
      previousRank,
      // Keep live score / intensity for frequent visual updates
      attentionPriority: live.attentionPriority,
      momentumIntensity: live.momentumIntensity,
    };
  });

  const nextPrev = new Map<string, number>();
  for (const r of rows) nextPrev.set(r.symbol, r.rank);

  const didReorder = first || due || criticalChanged;
  return {
    rows,
    state: {
      order,
      lastReorderAt: didReorder ? nowMs : state.lastReorderAt,
      previousRanks: didReorder ? nextPrev : state.previousRanks,
      // Always track the live critical set so clear→reappear still force-reorders.
      criticalKey,
    },
    reordered: first ? false : reordered,
    criticalAnnouncements: announcements,
  };
}
