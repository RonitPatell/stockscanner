/**
 * Sticky market movers for the Trading Floor.
 * Keeps actively traded names on screen even when a poll returns a thin/empty snapshot.
 */

import type { VolumeLeader } from "@/types";
import type { LiveQuote } from "../LiveQuoteProvider";

export const FLOOR_STICKY_MS = 30 * 60_000;
export const FLOOR_MAX_LEADERS = 40;

export type StickyLeader = VolumeLeader & { seenAt: number };

export function mergeStickyLeaders(
  prev: Map<string, StickyLeader>,
  incoming: VolumeLeader[],
  now = Date.now()
): Map<string, StickyLeader> {
  const next = new Map(prev);
  for (const row of incoming) {
    const sym = row.symbol.toUpperCase();
    if (!sym) continue;
    const prior = next.get(sym);
    next.set(sym, {
      ...prior,
      ...row,
      symbol: sym,
      // Prefer richer volume/rvol when the new row is empty
      volume: row.volume > 0 ? row.volume : prior?.volume ?? 0,
      avgVolume: row.avgVolume > 0 ? row.avgVolume : prior?.avgVolume ?? 0,
      rVol: row.rVol > 0 ? row.rVol : prior?.rVol ?? 0,
      floatShares: row.floatShares ?? prior?.floatShares,
      marketCap: row.marketCap ?? prior?.marketCap,
      ticks: row.ticks ?? prior?.ticks,
      seenAt: now,
    });
  }
  for (const [sym, row] of next) {
    if (now - row.seenAt > FLOOR_STICKY_MS) next.delete(sym);
  }
  return next;
}

export function stickyToSorted(map: Map<string, StickyLeader>): VolumeLeader[] {
  return [...map.values()]
    .sort((a, b) => {
      if (b.rVol !== a.rVol) return b.rVol - a.rVol;
      if ((b.volume ?? 0) !== (a.volume ?? 0)) return (b.volume ?? 0) - (a.volume ?? 0);
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    })
    .slice(0, FLOOR_MAX_LEADERS)
    .map(({ seenAt: _seen, ...row }) => row);
}

/** Build mover rows from live quotes — market activity, not news membership. */
export function leadersFromLiveQuotes(
  quotes: Record<string, LiveQuote>
): VolumeLeader[] {
  const out: VolumeLeader[] = [];
  for (const [symbol, q] of Object.entries(quotes)) {
    if (!q || !(q.price > 0)) continue;
    const rVol = q.rVol ?? 0;
    const vol = q.volume ?? 0;
    const chg = Math.abs(q.changePercent ?? 0);
    // Actively traded: relative volume, meaningful volume, or a real move
    if (rVol < 1.2 && vol < 250_000 && chg < 1.5) continue;
    out.push({
      symbol: symbol.toUpperCase(),
      price: q.price,
      changePercent: q.changePercent,
      volume: vol,
      avgVolume: q.avgVolume ?? 0,
      rVol: rVol > 0 ? rVol : Math.max(1, chg / 6),
      dayHigh: q.dayHigh ?? q.price,
      nearHod:
        q.dayHigh != null && q.dayHigh > 0 && q.price >= q.dayHigh * 0.995,
      floatShares: q.floatShares,
      marketCap: q.marketCap,
      source: "universe",
    });
  }
  return out;
}

export function formatMarketCap(n: number | null | undefined): string {
  if (n == null || !(n > 0)) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}
