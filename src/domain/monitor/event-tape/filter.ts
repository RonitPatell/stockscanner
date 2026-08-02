import { MARKET_TAPE_TYPES, RISK_TAPE_TYPES } from "./config.ts";
import type { MonitorTapeItem, TapeFilterPreset } from "./types.ts";

export function filterTapeItems(
  items: MonitorTapeItem[],
  filter: TapeFilterPreset,
  opts?: {
    selectedSymbol?: string | null;
    watchlist?: ReadonlySet<string> | string[];
  }
): MonitorTapeItem[] {
  const watch: ReadonlySet<string> = (() => {
    const raw = opts?.watchlist;
    if (!raw) return new Set();
    if (raw instanceof Set) {
      const next = new Set<string>();
      for (const s of raw) next.add(String(s).toUpperCase());
      return next;
    }
    return new Set(Array.from(raw, (s) => String(s).toUpperCase()));
  })();
  const selected = opts?.selectedSymbol?.toUpperCase() ?? null;

  switch (filter) {
    case "all":
      return items;
    case "selected":
      if (!selected) return [];
      return items.filter((i) => i.symbol === selected);
    case "watchlist":
      return items.filter((i) => watch.has(i.symbol));
    case "risk":
      return items.filter((i) => RISK_TAPE_TYPES.has(i.type));
    case "market":
      return items.filter((i) => MARKET_TAPE_TYPES.has(i.type));
    default:
      return items;
  }
}

/** Newest first for UI. */
export function sortTapeNewestFirst(items: MonitorTapeItem[]): MonitorTapeItem[] {
  return [...items].sort((a, b) => b.atMs - a.atMs || a.symbol.localeCompare(b.symbol));
}
