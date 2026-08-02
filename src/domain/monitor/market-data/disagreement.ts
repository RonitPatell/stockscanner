import type {
  MarketDataProviderId,
  NormalizedTrade,
  ProviderDisagreement,
} from "./types.ts";

export interface LastTradePrice {
  provider: MarketDataProviderId;
  price: number;
  asOf: string;
}

/**
 * Detect when two providers disagree on last trade price beyond tolerance.
 */
export function detectTradePriceDisagreement(
  a: LastTradePrice,
  b: LastTradePrice,
  opts: { absTol?: number; relTol?: number; symbol: string } 
): ProviderDisagreement | null {
  const absTol = opts.absTol ?? 0.02;
  const relTol = opts.relTol ?? 0.002; // 20 bps
  const abs = Math.abs(a.price - b.price);
  const rel = abs / Math.max(a.price, b.price, 1e-9);
  if (abs <= absTol && rel <= relTol) return null;
  return {
    symbol: opts.symbol,
    field: "trade.price",
    providers: [
      { provider: a.provider, value: a.price, asOf: a.asOf },
      { provider: b.provider, value: b.price, asOf: b.asOf },
    ],
    maxAbsDiff: abs,
    maxRelDiff: rel,
  };
}

export function lastTradeFromNormalized(
  trade: NormalizedTrade
): LastTradePrice {
  return {
    provider: trade.provider,
    price: trade.price,
    asOf: trade.sipTimestamp,
  };
}
