import type { TradeabilityThresholds } from "./config.ts";
import type {
  TradeabilityMetrics,
  TradeabilityWarning,
  TradeabilityWarningFlag,
} from "./types.ts";

export function buildTradeabilityWarnings(input: {
  metrics: TradeabilityMetrics;
  thresholds: TradeabilityThresholds;
  dayMoveAbsPct?: number | null;
}): TradeabilityWarning[] {
  const { metrics: m, thresholds: t } = input;
  const flags: Array<{
    flag: TradeabilityWarningFlag;
    active: boolean;
    detail: string;
  }> = [];

  flags.push({
    flag: "MARKET_DATA_UNAVAILABLE",
    active:
      m.missingInputs.includes("price") ||
      (m.absoluteSpread.availability === "unavailable" &&
        m.dollarVolume.availability === "unavailable"),
    detail:
      m.missingInputs.length > 0
        ? `Missing: ${m.missingInputs.join(", ")}`
        : "Core quote fields present",
  });

  flags.push({
    flag: "WIDE_SPREAD",
    active: m.spreadBps.value != null && m.spreadBps.value >= t.wideSpreadBps,
    detail:
      m.spreadBps.value == null
        ? "Spread unavailable"
        : `Spread ${m.spreadBps.value.toFixed(0)} bps (warn ≥ ${t.wideSpreadBps})`,
  });

  flags.push({
    flag: "STALE_QUOTE",
    active:
      m.quoteAgeSec.value != null && m.quoteAgeSec.value >= t.staleQuoteSec,
    detail:
      m.quoteAgeSec.value == null
        ? "Quote age unknown"
        : `Quote age ${m.quoteAgeSec.value}s`,
  });

  flags.push({
    flag: "INSUFFICIENT_DEPTH",
    active:
      !m.hasLicensedDepth ||
      ((m.bidSize.value == null || m.askSize.value == null) &&
        m.hasLicensedDepth) ||
      (m.bidSize.value != null &&
        m.askSize.value != null &&
        Math.min(m.bidSize.value, m.askSize.value) <
          t.minDepthSharesForSufficient),
    detail: !m.hasLicensedDepth
      ? "Licensed L1 depth not entitled — depth estimates withheld"
      : m.bidSize.value == null || m.askSize.value == null
        ? "Depth sizes missing despite license"
        : `Visible size min ${Math.min(m.bidSize.value, m.askSize.value)} shares`,
  });

  flags.push({
    flag: "LOW_DOLLAR_VOLUME",
    active:
      m.dollarVolume.value != null &&
      m.dollarVolume.value < t.lowDollarVolume,
    detail:
      m.dollarVolume.value == null
        ? "Dollar volume unavailable"
        : `Dollar volume $${Math.round(m.dollarVolume.value).toLocaleString()}`,
  });

  flags.push({
    flag: "HALT_RISK",
    active: (m.haltCount.value ?? 0) > 0,
    detail:
      m.haltCount.availability === "unavailable"
        ? "Halt feed unavailable"
        : `Session halt count ${m.haltCount.value}`,
  });

  flags.push({
    flag: "FLOAT_UNCERTAIN",
    active:
      m.floatConfidence === "unavailable" ||
      m.floatConfidence === "low" ||
      m.floatShares.availability === "unavailable",
    detail: `Float confidence: ${m.floatConfidence}`,
  });

  flags.push({
    flag: "HIGH_VOLATILITY",
    active:
      m.realizedVolatilityPct.value != null &&
      m.realizedVolatilityPct.value >= t.highVolPct,
    detail:
      m.realizedVolatilityPct.value == null
        ? "Realized vol unavailable"
        : `RV ${m.realizedVolatilityPct.value.toFixed(2)}%`,
  });

  const dayMove = input.dayMoveAbsPct;
  flags.push({
    flag: "EXTENDED_FROM_EVENT",
    active: dayMove != null && dayMove >= t.extendedMovePct,
    detail:
      dayMove == null
        ? "Day move unavailable"
        : `Day |move| ${dayMove.toFixed(1)}%`,
  });

  return flags.map((f) => ({
    flag: f.flag,
    active: f.active,
    detail: f.detail,
  }));
}
