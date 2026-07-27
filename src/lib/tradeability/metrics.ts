import { avail, unavailable, distancePct } from "../decision-card/format.ts";
import { hasLicensedL1Depth, depthUnavailableNote } from "./entitlements.ts";
import type {
  FloatConfidence,
  MarketSessionLabel,
  TradeabilityInput,
  TradeabilityMetrics,
} from "./types.ts";

function realizedVol(
  bars: Array<{ t: number; c: number }> | undefined,
  windowSec: number,
  nowSec: number
): number | null {
  if (!bars?.length) return null;
  const from = nowSec - windowSec;
  const slice = bars.filter((b) => b.t >= from && b.t <= nowSec);
  if (slice.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const a = slice[i - 1]!.c;
    const b = slice[i]!.c;
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const v =
    rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(Math.max(0, v)) * 100;
}

function resolveFloatConfidence(
  floatShares: number | null,
  matchMethod?: string | null,
  floatSource?: string | null
): FloatConfidence {
  if (floatShares == null || !(floatShares > 0)) return "unavailable";
  if (floatSource === "vendor") return "high";
  if (matchMethod === "cashtag" || matchMethod === "exchange_tag") return "medium";
  if (floatSource === "profile_heuristic") return "low";
  return "low";
}

export function computeTradeabilityMetrics(
  input: TradeabilityInput
): TradeabilityMetrics {
  const tape = input.tape ?? {};
  const nowMs = input.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const missing: string[] = [];

  const price = tape.price ?? null;
  let absSpread = tape.spreadDollars ?? null;
  if (absSpread == null && tape.bid != null && tape.ask != null && tape.bid > 0) {
    absSpread = tape.ask - tape.bid;
  }
  let spreadBps = tape.spreadBps ?? null;
  if (spreadBps == null && absSpread != null && price != null && price > 0) {
    spreadBps = (absSpread / price) * 10_000;
  }

  const hasLicense = hasLicensedL1Depth({
    override: input.hasLicensedDepth,
    tapeHasBidAskSize: tape.bidSize != null || tape.askSize != null,
  });

  const bidSize =
    hasLicense && tape.bidSize != null
      ? avail(tape.bidSize)
      : unavailable(depthUnavailableNote(hasLicense));
  const askSize =
    hasLicense && tape.askSize != null
      ? avail(tape.askSize)
      : unavailable(depthUnavailableNote(hasLicense));

  if (!hasLicense) missing.push("licensed_l1_depth");
  if (absSpread == null) missing.push("spread");
  if (tape.quoteAgeSec == null) missing.push("quote_age");
  if (tape.dollarVolume == null && !(price != null && tape.volume != null)) {
    missing.push("dollar_volume");
  }
  if (tape.floatShares == null) missing.push("float");
  if (tape.rVol == null && !(tape.volume != null && tape.avgVolume != null)) {
    missing.push("relative_volume");
  }
  if (tape.vwap == null) missing.push("vwap");
  if (tape.dayHigh == null) missing.push("hod");
  if (tape.premarketHigh == null) missing.push("premarket_high");
  if (tape.haltCount == null) missing.push("halt_count");
  if (tape.dollarVolume1m == null) missing.push("dollar_volume_1m");
  if (tape.dollarVolume5m == null) missing.push("dollar_volume_5m");

  const dollarVolume =
    tape.dollarVolume ??
    (price != null && tape.volume != null && price > 0 && tape.volume > 0
      ? price * tape.volume
      : null);

  const rVol =
    tape.rVol ??
    (tape.volume != null && tape.avgVolume != null && tape.avgVolume > 0
      ? tape.volume / tape.avgVolume
      : null);

  const floatShares = tape.floatShares ?? null;
  const floatConf = resolveFloatConfidence(
    floatShares,
    input.matchMethod,
    input.floatSource
  );

  const turnover =
    floatShares != null &&
    floatShares > 0 &&
    tape.volume != null &&
    tape.volume > 0
      ? (tape.volume / floatShares) * 100
      : null;

  const rv =
    tape.realizedVolPct ?? realizedVol(tape.bars1m, 300, nowSec);

  const session = input.marketSession ?? "unknown";

  // Critical market data gate
  if (price == null && absSpread == null && dollarVolume == null) {
    if (!missing.includes("price")) missing.push("price");
  }

  return {
    absoluteSpread:
      absSpread != null
        ? avail(absSpread)
        : unavailable("spread_unavailable"),
    spreadBps:
      spreadBps != null ? avail(spreadBps) : unavailable("spread_bps_unavailable"),
    bidSize,
    askSize,
    quoteAgeSec:
      tape.quoteAgeSec != null
        ? avail(tape.quoteAgeSec, {
            stale: tape.quoteAgeSec > 30,
            note: tape.quoteAgeSec > 30 ? "stale_quote" : undefined,
          })
        : unavailable("quote_age_unknown"),
    dollarVolume:
      dollarVolume != null
        ? avail(dollarVolume)
        : unavailable("dollar_volume_unavailable"),
    dollarVolume1m:
      tape.dollarVolume1m != null
        ? avail(tape.dollarVolume1m)
        : unavailable("requires_1m_bars"),
    dollarVolume5m:
      tape.dollarVolume5m != null
        ? avail(tape.dollarVolume5m)
        : unavailable("requires_1m_bars"),
    relativeVolume:
      rVol != null ? avail(rVol) : unavailable("rvol_unavailable"),
    volumeAcceleration:
      tape.volAccel != null
        ? avail(tape.volAccel)
        : unavailable("requires_1m_bars"),
    floatShares:
      floatShares != null
        ? avail(floatShares, {
            estimated: floatConf === "low" || floatConf === "medium",
            note:
              floatConf === "low"
                ? "profile_heuristic"
                : floatConf === "medium"
                  ? "medium_confidence"
                  : undefined,
          })
        : unavailable("float_unavailable"),
    floatConfidence: floatConf,
    turnoverPctOfFloat:
      turnover != null ? avail(turnover) : unavailable("turnover_unavailable"),
    realizedVolatilityPct:
      rv != null ? avail(rv) : unavailable("requires_bars_for_rv"),
    recentGapPct:
      tape.recentGapPct != null
        ? avail(tape.recentGapPct)
        : unavailable("gap_unavailable"),
    haltCount:
      tape.haltCount != null
        ? avail(tape.haltCount)
        : unavailable("no_exchange_halt_feed"),
    quoteUpdateFrequencyPerMin:
      tape.quoteUpdatesLastMinute != null
        ? avail(tape.quoteUpdatesLastMinute)
        : unavailable("quote_frequency_unknown"),
    distanceFromVwapPct:
      tape.vwap != null
        ? distancePct(tape.vwap, price)
        : unavailable("vwap_not_available"),
    distanceFromHodPct:
      tape.dayHigh != null
        ? distancePct(tape.dayHigh, price)
        : unavailable("hod_not_available"),
    distanceFromPremarketHighPct:
      tape.premarketHigh != null
        ? distancePct(tape.premarketHigh, price)
        : unavailable("premarket_high_not_available"),
    missingInputs: [...new Set(missing)],
    hasLicensedDepth: hasLicense,
    marketSession: session as MarketSessionLabel,
  };
}
