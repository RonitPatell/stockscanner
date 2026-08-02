/**
 * Apply permitted personalization to a public snapshot.
 * Never injects private strategy contents or other users' data.
 */

import type { MonitorPublicSnapshot } from "../../../domain/monitor/snapshot/index.ts";
import type { MonitorUiPreferences } from "./types.ts";

export function personalizeMonitorSnapshot(
  snapshot: MonitorPublicSnapshot,
  prefs: MonitorUiPreferences
): MonitorPublicSnapshot {
  const pin = prefs.pinnedTicker?.toUpperCase() ?? null;
  if (!pin) return snapshot;

  const reorder = <T extends { symbol: string }>(rows: T[]): T[] => {
    const idx = rows.findIndex((r) => r.symbol.toUpperCase() === pin);
    if (idx <= 0) return rows;
    const copy = [...rows];
    const [row] = copy.splice(idx, 1);
    return [row!, ...copy];
  };

  return {
    ...snapshot,
    // Leader stays market-global; pin only reorders inspection lists.
    priorityLadder: reorder(snapshot.priorityLadder).map((t, i) => ({
      ...t,
      rank: i + 1,
    })),
    momentumField: reorder(snapshot.momentumField).map((t, i) => ({
      ...t,
      rank: i + 1,
    })),
  };
}

export function pickSelectedSymbol(
  snapshot: MonitorPublicSnapshot | null,
  prefs: MonitorUiPreferences,
  deepLinkSymbol?: string | null
): string | null {
  const deep =
    deepLinkSymbol && /^[A-Za-z]{1,5}$/.test(deepLinkSymbol)
      ? deepLinkSymbol.toUpperCase()
      : null;
  if (deep) return deep;
  if (prefs.pinnedTicker) return prefs.pinnedTicker.toUpperCase();
  if (snapshot?.globalLeader) return snapshot.globalLeader;
  const eligible = snapshot?.priorityLadder.find((t) => t.leaderEligible);
  return eligible?.symbol ?? null;
}
