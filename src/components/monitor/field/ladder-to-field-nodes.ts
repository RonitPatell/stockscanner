import type { MonitorLadderRow } from "../monitor-types.ts";
import type { MomentumFieldNode } from "./field-types.ts";

const MUTE_KEY = "tt-muted-symbols-v1";

export function readMutedSymbols(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(MUTE_KEY) || "[]") as string[];
    return new Set(raw.map((s) => s.toUpperCase()));
  } catch {
    return new Set();
  }
}

export function writeMutedSymbols(set: Set<string>): void {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/**
 * Map ladder rows → field nodes. Previous ranks passed in for change indicators.
 * Keeps market calc out of the render path — only projects display fields.
 */
export function ladderToFieldNodes(
  ladder: MonitorLadderRow[],
  opts: {
    leaderSymbol: string | null;
    pinnedSymbol: string | null;
    muted: Set<string>;
    previousRanks: Map<string, number>;
    freshnessMs?: number | null;
  }
): MomentumFieldNode[] {
  return ladder.map((row) => {
    const state = String(row.momentumState).toUpperCase();
    const halted = state === "HALTED";
    const prev = opts.previousRanks.get(row.symbol) ?? null;
    return {
      symbol: row.symbol,
      rank: row.rank,
      previousRank: prev,
      attentionPriority: row.attentionPriority,
      momentumState: row.momentumState,
      direction: row.direction,
      accelerationNorm: Math.min(
        1,
        Math.max(0, (row.momentumIntensity - 30) / 70)
      ),
      risk: riskFromTier(row.tier, halted),
      verifiedCatalyst: /catalyst|verified/i.test(row.reason),
      sourceUrl: /catalyst|verified/i.test(row.reason)
        ? `https://finance.yahoo.com/quote/${row.symbol}`
        : null,
      dataFreshnessMs: opts.freshnessMs ?? 1200,
      dataQualityWarning:
        (opts.freshnessMs ?? 0) > 15_000 || row.tier === "LOW",
      halted,
      onWatchlist: row.onWatchlist,
      muted: opts.muted.has(row.symbol),
      pinned: opts.pinnedSymbol === row.symbol,
      isLeader:
        opts.leaderSymbol === row.symbol ||
        (opts.leaderSymbol == null && row.rank === 1 && !halted),
    };
  });
}

function riskFromTier(
  tier: MonitorLadderRow["tier"],
  halted: boolean
): MomentumFieldNode["risk"] {
  if (halted) return "critical";
  if (tier === "CRITICAL") return "high";
  if (tier === "HIGH") return "medium";
  if (tier === "MEDIUM") return "low";
  return "none";
}
