import {
  TRADEABILITY_DISCLAIMER,
  TRADEABILITY_ENGINE_VERSION,
} from "./version.ts";
import {
  getTradeabilityThresholds,
  parseUserIllustrativeNotionals,
} from "./config.ts";
import { computeTradeabilityMetrics } from "./metrics.ts";
import { estimateIllustrativeSlippage } from "./slippage.ts";
import { buildTradeabilityWarnings } from "./warnings.ts";
import { applyTradeabilityHysteresis } from "./hysteresis.ts";
import type {
  TradeabilityClass,
  TradeabilityInput,
  TradeabilityResult,
  TradeabilityRuleContribution,
} from "./types.ts";

/**
 * Tradeability Engine — can this name be realistically entered/exited?
 * Separate from catalyst quality. Never claims direction.
 */
export function computeTradeability(
  input: TradeabilityInput
): TradeabilityResult {
  const nowMs = input.nowMs ?? Date.now();
  const thresholds = getTradeabilityThresholds();
  const metrics = computeTradeabilityMetrics({ ...input, nowMs });
  const warnings = buildTradeabilityWarnings({
    metrics,
    thresholds,
    dayMoveAbsPct: input.tape?.dayMoveAbsPct,
  });

  const rules: TradeabilityRuleContribution[] = [];
  const dv = metrics.dollarVolume.value;
  const spread = metrics.spreadBps.value;
  const stale = warnings.find((w) => w.flag === "STALE_QUOTE")?.active;
  const marketMissing = warnings.find(
    (w) => w.flag === "MARKET_DATA_UNAVAILABLE"
  )?.active;

  rules.push({
    id: "critical_quote_data",
    label: "Critical quote / volume data present",
    passed: !marketMissing,
    detail: marketMissing
      ? `Missing inputs: ${metrics.missingInputs.join(", ") || "core fields"}`
      : "Enough fields to classify",
  });

  rules.push({
    id: "extremely_thin_spread",
    label: `Spread ≥ ${thresholds.extremelyThinSpreadBps} bps`,
    passed: spread != null && spread >= thresholds.extremelyThinSpreadBps,
    detail: spread == null ? "Spread unavailable" : `${spread.toFixed(0)} bps`,
  });

  rules.push({
    id: "extremely_thin_volume",
    label: `Dollar volume < $${thresholds.extremelyThinDollarVolume.toLocaleString()}`,
    passed:
      dv != null && dv < thresholds.extremelyThinDollarVolume,
    detail: dv == null ? "DV unavailable" : `$${Math.round(dv).toLocaleString()}`,
  });

  rules.push({
    id: "liquid_band",
    label: `LIQUID band (DV ≥ $${thresholds.liquidMinDollarVolume.toLocaleString()}, spread ≤ ${thresholds.liquidMaxSpreadBps} bps)`,
    passed:
      dv != null &&
      dv >= thresholds.liquidMinDollarVolume &&
      (spread == null || spread <= thresholds.liquidMaxSpreadBps) &&
      !stale,
    detail: "Large-cap-like liquidity conditions when data present",
  });

  rules.push({
    id: "acceptable_band",
    label: `ACCEPTABLE band (DV ≥ $${thresholds.acceptableMinDollarVolume.toLocaleString()})`,
    passed:
      dv != null &&
      dv >= thresholds.acceptableMinDollarVolume &&
      (spread == null || spread <= thresholds.acceptableMaxSpreadBps),
    detail: "Tradable for modest illustrative sizes when data present",
  });

  rules.push({
    id: "thin_band",
    label: "THIN band (elevated friction)",
    passed:
      (dv != null && dv < thresholds.acceptableMinDollarVolume) ||
      (spread != null && spread > thresholds.acceptableMaxSpreadBps) ||
      (metrics.floatShares.value != null &&
        metrics.floatShares.value < 5_000_000 &&
        dv != null &&
        dv < 5_000_000),
    detail: "Low float and/or modest dollar volume",
  });

  let candidate: TradeabilityClass = "UNKNOWN";

  if (marketMissing || (dv == null && spread == null)) {
    candidate = "UNKNOWN";
  } else if (
    rules.find((r) => r.id === "extremely_thin_spread")?.passed ||
    rules.find((r) => r.id === "extremely_thin_volume")?.passed
  ) {
    candidate = "EXTREMELY_THIN";
  } else if (rules.find((r) => r.id === "liquid_band")?.passed) {
    candidate = "LIQUID";
  } else if (rules.find((r) => r.id === "acceptable_band")?.passed) {
    candidate = "ACCEPTABLE";
  } else if (rules.find((r) => r.id === "thin_band")?.passed) {
    candidate = "THIN";
  } else if (dv != null || spread != null) {
    candidate = "THIN";
  } else {
    candidate = "UNKNOWN";
  }

  // Stale quotes cannot be LIQUID
  if (candidate === "LIQUID" && stale) {
    candidate = "ACCEPTABLE";
    rules.push({
      id: "stale_downgrade",
      label: "Stale quote blocks LIQUID",
      passed: true,
      detail: "Downgraded to ACCEPTABLE while quote is stale",
    });
  }

  // Active halt → at best THIN
  if (
    (metrics.haltCount.value ?? 0) > 0 &&
    (candidate === "LIQUID" || candidate === "ACCEPTABLE")
  ) {
    candidate = "THIN";
    rules.push({
      id: "halt_downgrade",
      label: "Halt risk caps tradeability",
      passed: true,
      detail: "Session halt count > 0 — capped at THIN",
    });
  }

  const hyst = applyTradeabilityHysteresis({
    candidate,
    previous: input.previousClass,
    previousAtMs: input.previousClassAtMs,
    nowMs,
    hysteresisMs: thresholds.hysteresisMs,
  });

  if (hyst.flappedSuppressed) {
    rules.push({
      id: "hysteresis_hold",
      label: "Hysteresis hold",
      passed: true,
      detail: `Held ${input.previousClass} (< ${thresholds.hysteresisMs}ms)`,
    });
  }

  const notionals = parseUserIllustrativeNotionals(
    input.illustrativeOrderNotionalsUsd,
    thresholds.defaultOrderNotionalsUsd
  );
  const illustrativeSlippage = estimateIllustrativeSlippage({
    metrics,
    orderNotionalsUsd: notionals,
    price: input.tape?.price ?? null,
  });

  const activeWarnings = warnings.filter((w) => w.active).map((w) => w.flag);
  const passed = rules.filter((r) => r.passed);
  const explanation =
    hyst.class === "UNKNOWN"
      ? `UNKNOWN — insufficient market data (${metrics.missingInputs.join(", ") || "core fields missing"}). Not a price prediction.`
      : `${hyst.class}: ${passed.map((r) => r.label).join("; ") || "classified from available tape"}.${
          activeWarnings.length
            ? ` Warnings: ${activeWarnings.join(", ")}.`
            : ""
        } Separate from catalyst quality — does not claim direction.`;

  return {
    engineVersion: TRADEABILITY_ENGINE_VERSION,
    symbol: input.symbol.toUpperCase(),
    class: hyst.class,
    previousClass: input.previousClass ?? null,
    flappedSuppressed: hyst.flappedSuppressed,
    metrics,
    warnings,
    rules,
    explanation,
    illustrativeSlippage,
    computedAt: new Date(nowMs).toISOString(),
    disclaimer: TRADEABILITY_DISCLAIMER,
  };
}

/** Incremental recompute from streaming tape. */
export function recomputeTradeability(
  input: TradeabilityInput,
  prior: TradeabilityResult | null
): TradeabilityResult {
  return computeTradeability({
    ...input,
    previousClass: prior?.class ?? input.previousClass,
    previousClassAtMs: prior
      ? new Date(prior.computedAt).getTime()
      : input.previousClassAtMs,
  });
}
