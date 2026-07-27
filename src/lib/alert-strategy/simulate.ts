import { evaluateStrategy, factsFromCatalyst } from "./evaluate.ts";
import type {
  AlertStrategy,
  SimulationResult,
  StrategyEvalFacts,
} from "./types.ts";

export interface SimulationCatalystRow {
  id: string;
  symbol: string;
  headline?: string | null;
  publishedAt: string;
  price?: number | null;
  floatShares?: number | null;
  catalystType?: string | null;
  sourceTier?: string | null;
  newsCount?: number | null;
  rVol?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  judgmentV2?: { catalystStrength?: string } | null;
  /** Optional pre-built extras (session, halt, etc.) */
  factsExtras?: Partial<StrategyEvalFacts>;
}

export interface SimulateOptions {
  /** Symbols treated as on-watchlist for simulation (hashed/count only in analytics) */
  watchlistSymbols?: string[];
  skipDeliveryMode?: boolean;
  maxSample?: number;
  lookbackDays?: number;
}

const DEFAULT_LIMITATIONS = [
  "Simulation uses stored historical catalysts only — not a live replay of every quote tick.",
  "Watchlist membership is approximated from the symbols you provide for the run.",
  "Spread, halt, tradeability, and reaction-stage fields may be missing on older rows (fail-closed for those conditions).",
  "Delivery modes (EARLY / CONFIRMED / RISK_ONLY) use the same logic as live alerts, but market confirmation uses snapshot fields at ingest time.",
  "Match count is illustrative — past match rate does not predict future alerts or P&L.",
];

/**
 * Historical match simulator — returns count, sample size, limitations.
 * Never includes phone numbers or full private watchlists in the result payload.
 */
export function simulateStrategy(
  strategy: AlertStrategy,
  rows: SimulationCatalystRow[],
  opts: SimulateOptions = {}
): SimulationResult {
  const max = opts.maxSample ?? 500;
  const sample = rows.slice(0, max);
  const watchSet = new Set(
    (opts.watchlistSymbols ?? []).map((s) => s.toUpperCase())
  );

  const matchedIds: string[] = [];
  for (const row of sample) {
    const onWatchlist = watchSet.has(row.symbol.toUpperCase());
    const facts = factsFromCatalyst(row, {
      onWatchlist,
      ...row.factsExtras,
    });
    // Build a minimal CatalystItem-like for delivery mode when needed
    const catalystStub = {
      id: row.id,
      symbol: row.symbol,
      headline: row.headline ?? "",
      source: "sim",
      publishedAt: row.publishedAt,
      price: row.price ?? undefined,
      floatShares: row.floatShares ?? undefined,
      catalystType: row.catalystType ?? undefined,
      sourceTier: row.sourceTier ?? undefined,
      newsCount: row.newsCount ?? undefined,
      rVol: row.rVol ?? undefined,
      changePercent: row.changePercent ?? undefined,
      volume: row.volume ?? undefined,
      verifiedConfidence: 80,
    } as Parameters<typeof evaluateStrategy>[2];

    const result = evaluateStrategy(strategy, facts, catalystStub, {
      skipDeliveryMode: opts.skipDeliveryMode,
    });
    if (result.matched) matchedIds.push(row.id);
  }

  const sampleSize = sample.length;
  const matchedCount = matchedIds.length;
  const limitations = [...DEFAULT_LIMITATIONS];
  if (opts.lookbackDays) {
    limitations.unshift(
      `Lookback window requested: ~${opts.lookbackDays} day(s).`
    );
  }
  if (sampleSize < (opts.maxSample ?? 500) && sampleSize < 50) {
    limitations.push(
      `Small sample (${sampleSize}) — treat match rate as directional only.`
    );
  }

  return {
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    matchedCount,
    sampleSize,
    matchRate: sampleSize > 0 ? matchedCount / sampleSize : null,
    sampleCatalystIds: matchedIds.slice(0, 25),
    limitations,
    disclaimer:
      "Historical simulation is not a performance guarantee. Private watchlists and phone numbers are never included in analytics payloads.",
  };
}
