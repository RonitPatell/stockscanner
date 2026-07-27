import { tradeabilityRank } from "./config.ts";
import type { TradeabilityClass } from "./types.ts";

/**
 * Prevent category flickering. Allow downgrades (worse liquidity) immediately;
 * upgrades require dwell. UNKNOWN always allowed when critical data missing.
 */
export function applyTradeabilityHysteresis(input: {
  candidate: TradeabilityClass;
  previous: TradeabilityClass | null | undefined;
  previousAtMs: number | null | undefined;
  nowMs: number;
  hysteresisMs: number;
}): { class: TradeabilityClass; flappedSuppressed: boolean } {
  const prev = input.previous ?? null;
  if (!prev || prev === input.candidate) {
    return { class: input.candidate, flappedSuppressed: false };
  }
  if (input.candidate === "UNKNOWN") {
    return { class: "UNKNOWN", flappedSuppressed: false };
  }
  const prevRank = tradeabilityRank(prev);
  const nextRank = tradeabilityRank(input.candidate);
  // Downgrade (worse) — immediate
  if (nextRank < prevRank) {
    return { class: input.candidate, flappedSuppressed: false };
  }
  // Upgrade — require dwell
  const elapsed = input.nowMs - (input.previousAtMs ?? 0);
  if (elapsed < input.hysteresisMs) {
    return { class: prev, flappedSuppressed: true };
  }
  return { class: input.candidate, flappedSuppressed: false };
}
