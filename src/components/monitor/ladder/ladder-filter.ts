import type { LadderFilter, PriorityLadderRow } from "./ladder-types.ts";

export const LADDER_FILTERS: Array<{ id: LadderFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "watchlist", label: "Watchlist" },
  { id: "strategy", label: "Strategy matches" },
  { id: "upward", label: "Upward" },
  { id: "downward", label: "Downward" },
  { id: "risk", label: "Risk events" },
  { id: "halted", label: "Halted" },
];

export function filterLadderRows(
  rows: PriorityLadderRow[],
  filter: LadderFilter
): PriorityLadderRow[] {
  switch (filter) {
    case "watchlist":
      return rows.filter((r) => r.onWatchlist);
    case "strategy":
      return rows.filter((r) => r.strategyMatch);
    case "upward":
      return rows.filter((r) => r.direction === "up");
    case "downward":
      return rows.filter((r) => r.direction === "down");
    case "risk":
      return rows.filter(
        (r) =>
          r.risk === "high" ||
          r.risk === "critical" ||
          r.halted ||
          r.criticalEvent
      );
    case "halted":
      return rows.filter((r) => r.halted);
    case "all":
    default:
      return rows;
  }
}
