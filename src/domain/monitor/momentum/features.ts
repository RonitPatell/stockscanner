import type {
  SymbolMarketState,
  SymbolReference,
} from "../market-state/types.ts";
import type { MetricField } from "../market-state/field.ts";
import type { MomentumRawFeatures } from "./types.ts";

function num(f: MetricField<number> | undefined): number | null {
  if (!f) return null;
  if (f.availability === "unavailable") return null;
  if (f.value == null || !Number.isFinite(f.value)) return null;
  return f.value;
}

/**
 * Extract normalized raw features from rolling market-state.
 * Prefer w15s for velocity/burst; w5s for acceleration sensitivity;
 * session for RVol / HOD / VWAP.
 */
export function extractFeatures(
  state: SymbolMarketState,
  ref?: SymbolReference | null
): MomentumRawFeatures {
  const w5 = state.windows.w5s;
  const w15 = state.windows.w15s;
  const w1m = state.windows.w1m;
  const sess = state.session;
  const halt = state.haltState.value;

  const flags = state.quote.quoteFlags ?? [];
  const quoteBad =
    flags.includes("crossed") ||
    flags.includes("stale") ||
    state.quote.spreadDollars.availability === "flagged" ||
    state.quote.spreadDollars.availability === "stale";

  const imb = w15.buySellImbalance;
  let sideReliability: number | null = null;
  if (imb.availability === "ok") sideReliability = 1;
  else if (imb.availability === "unavailable") sideReliability = 0;

  return {
    symbol: state.symbol,
    asOfMs: state.asOfMs,
    session: sess.segment,
    lastPrice: num(state.lastPrice),
    sourceDataAgeMs: num(state.dataFreshnessMs),
    halted: Boolean(halt?.halted),
    haltReason: halt?.reason ?? null,
    priceVelocity: num(w15.priceVelocity) ?? num(w5.priceVelocity),
    priceAcceleration:
      num(w5.priceAcceleration) ?? num(w15.priceAcceleration),
    tradesPerSecond: num(w15.tradesPerSecond) ?? num(w5.tradesPerSecond),
    tradeRateAcceleration:
      num(w5.tradeRateAcceleration) ?? num(w15.tradeRateAcceleration),
    shareVolumeVelocity:
      num(w15.shareVolumeVelocity) ?? num(w5.shareVolumeVelocity),
    dollarVolumeVelocity:
      num(w15.dollarVolumeVelocity) ?? num(w5.dollarVolumeVelocity),
    relativeVolume: num(sess.relativeVolume),
    distanceFromHod: num(sess.distanceFromHod),
    distanceFromLod: num(sess.distanceFromLod),
    distanceFromVwap: num(sess.distanceFromVwap),
    quoteUpdateRate: num(state.quote.quoteUpdateRate),
    spreadBps: num(state.quote.spreadBps),
    spreadFlagged:
      state.quote.spreadDollars.availability === "flagged" ||
      state.quote.spreadBps.availability === "flagged",
    quoteStaleOrCrossed: quoteBad,
    sideReliability,
    tradeCountShort: num(w15.tradeCount) ?? num(w5.tradeCount),
    tradeCountMid: num(w1m.tradeCount),
    avgDailyVolume: ref?.avgDailyVolume ?? null,
  };
}
