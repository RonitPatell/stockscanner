import { getSpeedWins, type SpeedWin } from "./speed-wins";

/** Assumed notional for paper "edge" math — one round lot of attention, not advice. */
export const EDGE_NOTIONAL_USD = 1_000;

export interface SpeedEdgeRow {
  id: string;
  symbol: string;
  headline: string;
  ingestDelaySec: number;
  changePercent: number;
  /** Estimated % of the move a late trader (you+3m) would miss vs catching at our ingest. */
  edgePercent: number;
  /** Dollar edge on $1,000 notional if you acted at ingest vs 3 minutes later. */
  edgeUsd: number;
  bias: "long" | "short";
  catalystType: string | null;
}

export interface SpeedEdgeSummary {
  generatedAt: string;
  notionalUsd: number;
  sampleSize: number;
  /** Sum of absolute paper edges (illustrative). */
  totalEdgeUsd: number;
  /** How many $19.99 months this paper edge would cover. */
  monthsCovered: number;
  /** True when paper edge ≥ one month of Pro. */
  paysForItself: boolean;
  avgIngestSec: number | null;
  under3mRate: number | null;
  rows: SpeedEdgeRow[];
  disclaimer: string;
}

/**
 * Heuristic: catalyst days front-load. Someone who sees the headline 3 minutes
 * later captures less of the early impulse than someone who saw it at our ingest.
 * This is illustrative paper math — not a backtest or guarantee.
 */
export function estimateSpeedEdgeUsd(
  changePercent: number,
  ingestDelaySec: number,
  lateLagSec = 180,
  notional = EDGE_NOTIONAL_USD
): { edgePercent: number; edgeUsd: number } {
  const move = Math.abs(changePercent);
  if (move < 0.5 || ingestDelaySec > 600) {
    return { edgePercent: 0, edgeUsd: 0 };
  }

  // Fraction of the day's catalyst impulse still "early" at a given delay
  const earlyFrac = (delaySec: number) => {
    const t = Math.max(0, Math.min(1, 1 - delaySec / 480));
    return 0.15 + t * 0.55; // 15–70% of move attributed to early window
  };

  const atIngest = earlyFrac(ingestDelaySec);
  const atLate = earlyFrac(ingestDelaySec + lateLagSec);
  const edgePercent = Math.max(0, (atIngest - atLate) * move);
  const edgeUsd = Math.round((edgePercent / 100) * notional * 100) / 100;
  return { edgePercent: Math.round(edgePercent * 100) / 100, edgeUsd };
}

function rowFromWin(win: SpeedWin): SpeedEdgeRow | null {
  const change = win.changePercent;
  if (change == null || Math.abs(change) < 1) return null;
  const { edgePercent, edgeUsd } = estimateSpeedEdgeUsd(change, win.ingestDelaySec);
  if (edgeUsd < 0.5) return null;
  return {
    id: win.id,
    symbol: win.symbol,
    headline: win.headline,
    ingestDelaySec: win.ingestDelaySec,
    changePercent: change,
    edgePercent,
    edgeUsd,
    bias: change >= 0 ? "long" : "short",
    catalystType: win.catalystType,
  };
}

export async function getSpeedEdgeSummary(
  limit = 12,
  hours = 72
): Promise<SpeedEdgeSummary> {
  const wins = await getSpeedWins(Math.min(40, limit * 3), hours, "impressive");
  const rows = wins
    .map(rowFromWin)
    .filter((r): r is SpeedEdgeRow => r != null)
    .sort((a, b) => b.edgeUsd - a.edgeUsd)
    .slice(0, limit);

  const totalEdgeUsd =
    Math.round(rows.reduce((sum, r) => sum + r.edgeUsd, 0) * 100) / 100;
  const monthsCovered =
    totalEdgeUsd > 0 ? Math.round((totalEdgeUsd / 19.99) * 10) / 10 : 0;

  const delays = wins.map((w) => w.ingestDelaySec);
  const avgIngestSec =
    delays.length > 0
      ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
      : null;
  const under3mRate =
    delays.length > 0
      ? Math.round((delays.filter((d) => d <= 180).length / delays.length) * 1000) / 10
      : null;

  return {
    generatedAt: new Date().toISOString(),
    notionalUsd: EDGE_NOTIONAL_USD,
    sampleSize: rows.length,
    totalEdgeUsd,
    monthsCovered,
    paysForItself: totalEdgeUsd >= 19.99,
    avgIngestSec,
    under3mRate,
    rows,
    disclaimer:
      "Illustrative paper edge on $1,000 notional if you acted at TrustTicker ingest vs ~3 minutes later. Not a backtest, not financial advice, past patterns do not guarantee future results.",
  };
}
