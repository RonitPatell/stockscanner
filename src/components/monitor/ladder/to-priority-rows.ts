import { explainFromRow } from "./ladder-explain.ts";
import type {
  LeaderHysteresisState,
  PriorityLadderRow,
} from "./ladder-types.ts";
import type { MonitorLadderRow } from "../monitor-types.ts";

export function toPriorityRows(
  ladder: MonitorLadderRow[],
  opts: {
    muted: Set<string>;
    pinnedSymbol: string | null;
    leaderSymbol: string | null;
    challengerSymbol: string | null;
    hysteresis: LeaderHysteresisState;
    freshnessMs: number | null;
    watchOverrides?: Map<string, boolean>;
    strategyOverrides?: Map<string, boolean>;
  }
): PriorityLadderRow[] {
  return ladder.map((r) => {
    const onWatchlist =
      opts.watchOverrides?.get(r.symbol) ?? r.onWatchlist;
    const strategyMatch =
      opts.strategyOverrides?.get(r.symbol) ??
      Boolean((r as MonitorLadderRow & { strategyMatch?: boolean }).strategyMatch);
    const halted =
      String(r.momentumState).toUpperCase() === "HALTED" ||
      Boolean((r as MonitorLadderRow & { halted?: boolean }).halted);
    const hasCatalyst =
      /catalyst|verified/i.test(r.reason) ||
      Boolean((r as MonitorLadderRow & { hasCatalyst?: boolean }).hasCatalyst);
    const catalystVerified =
      /verified/i.test(r.reason) ||
      Boolean(
        (r as MonitorLadderRow & { catalystVerified?: boolean }).catalystVerified
      );
    const risk = riskFromRow(r, halted);
    const criticalEvent =
      halted ||
      risk === "critical" ||
      Boolean((r as MonitorLadderRow & { criticalEvent?: boolean }).criticalEvent);
    // Stale / explicit confidence only — never mark LOW tier as “low confidence”
    // merely to fill the screen with warnings.
    const dataConfidenceWarning =
      (opts.freshnessMs != null && opts.freshnessMs > 15_000) ||
      Boolean(
        (r as MonitorLadderRow & { dataConfidenceWarning?: boolean })
          .dataConfidenceWarning
      );
    const pinned = opts.pinnedSymbol === r.symbol;
    const priorityReason = conciseReason(r.reason, {
      halted,
      risk,
      hasCatalyst,
      catalystVerified,
    });
    const base = {
      symbol: r.symbol,
      attentionPriority: r.attentionPriority,
      rank: r.rank,
      previousRank: null as number | null,
      momentumIntensity: r.momentumIntensity,
      momentumState: r.momentumState,
      direction: r.direction,
      priorityReason,
      hasCatalyst,
      catalystVerified,
      risk,
      onWatchlist,
      strategyMatch,
      dataConfidenceWarning,
      dataFreshnessMs: opts.freshnessMs,
      halted,
      muted: opts.muted.has(r.symbol),
      pinned,
      sourceUrl: hasCatalyst
        ? `https://finance.yahoo.com/quote/${r.symbol}`
        : null,
      criticalEvent,
      explain: explainFromRow(
        {
          symbol: r.symbol,
          momentumIntensity: r.momentumIntensity,
          hasCatalyst,
          catalystVerified,
          risk,
          halted,
          onWatchlist,
          strategyMatch,
          dataConfidenceWarning,
          dataFreshnessMs: opts.freshnessMs,
          pinned,
          criticalEvent,
        },
        {
          leaderSymbol: opts.leaderSymbol,
          challengerSymbol: opts.challengerSymbol,
          hysteresis: opts.hysteresis,
        }
      ),
    };
    return base;
  });
}

function riskFromRow(
  r: MonitorLadderRow,
  halted: boolean
): PriorityLadderRow["risk"] {
  if (halted) return "critical";
  if (r.tier === "CRITICAL") return "high";
  if (r.tier === "HIGH") return "medium";
  if (r.tier === "MEDIUM") return "low";
  return "none";
}

/** One scannable reason line — risk/halt first when material. */
function conciseReason(
  raw: string,
  opts: {
    halted: boolean;
    risk: PriorityLadderRow["risk"];
    hasCatalyst: boolean;
    catalystVerified: boolean;
  }
): string {
  const parts: string[] = [];
  if (opts.halted) parts.push("Halt");
  else if (opts.risk === "critical" || opts.risk === "high") {
    parts.push(opts.risk === "critical" ? "Critical risk" : "Elevated risk");
  }
  const cleaned = (raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[-–—]\s*/, "")
    .trim();
  if (cleaned) parts.push(cleaned);
  else if (opts.catalystVerified) parts.push("Verified catalyst");
  else if (opts.hasCatalyst) parts.push("Catalyst");
  const line = parts.join(" · ");
  return line.length > 52 ? `${line.slice(0, 51)}…` : line;
}
