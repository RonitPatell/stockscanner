import { avail, unavailable } from "../decision-card/format.ts";
import { SLIPPAGE_DISCLAIMER } from "./version.ts";
import type { IllustrativeSlippage, TradeabilityMetrics } from "./types.ts";

/**
 * Illustrative slippage for configurable order notionals.
 * Uses half-spread proxy only — NEVER depth-based without licensed depth.
 * Not an execution guarantee.
 */
export function estimateIllustrativeSlippage(input: {
  metrics: TradeabilityMetrics;
  orderNotionalsUsd: number[];
  price: number | null;
}): IllustrativeSlippage[] {
  const { metrics, orderNotionalsUsd, price } = input;
  const spreadBps = metrics.spreadBps.value;

  return orderNotionalsUsd.map((notional) => {
    if (spreadBps == null || !(notional > 0)) {
      return {
        orderNotionalUsd: notional,
        estimatedSlippageBps: unavailable(
          metrics.hasLicensedDepth
            ? "insufficient_inputs_for_slippage"
            : "no_depth_spread_proxy_unavailable"
        ),
        estimatedSlippageUsd: unavailable("slippage_unavailable"),
        method: "unavailable" as const,
        disclaimer: SLIPPAGE_DISCLAIMER,
      };
    }

    // Half-spread as baseline illustrative cost; widen if quote stale / thin
    let mult = 0.5;
    if (metrics.quoteAgeSec.value != null && metrics.quoteAgeSec.value > 30) {
      mult *= 1.5;
    }
    if (
      metrics.dollarVolume.value != null &&
      metrics.dollarVolume.value < 500_000
    ) {
      mult *= 1.75;
    }
    // Without licensed depth we refuse to scale by "eat the book"
    if (!metrics.hasLicensedDepth) {
      // Cap illustrative impact — do not invent book walk
      const bps = spreadBps * mult;
      const usd =
        price != null && price > 0 ? (bps / 10_000) * notional : null;
      return {
        orderNotionalUsd: notional,
        estimatedSlippageBps: avail(bps, {
          estimated: true,
          note: "half_spread_proxy_no_depth",
        }),
        estimatedSlippageUsd:
          usd != null
            ? avail(usd, { estimated: true, note: "illustrative_only" })
            : unavailable("price_missing_for_usd"),
        method: "spread_proxy" as const,
        disclaimer: SLIPPAGE_DISCLAIMER,
      };
    }

    // Licensed depth present: still spread-proxy unless sizes allow a share estimate
    const midSize =
      metrics.bidSize.value != null && metrics.askSize.value != null
        ? (metrics.bidSize.value + metrics.askSize.value) / 2
        : null;
    let bps = spreadBps * mult;
    if (midSize != null && price != null && price > 0) {
      const shares = notional / price;
      if (shares > midSize) {
        // Mild extra penalty when order exceeds visible size — still illustrative
        bps *= 1 + Math.min(2, (shares - midSize) / Math.max(midSize, 1));
      }
    }

    const usd = (bps / 10_000) * notional;
    return {
      orderNotionalUsd: notional,
      estimatedSlippageBps: avail(bps, {
        estimated: true,
        note: "spread_proxy_with_visible_size",
      }),
      estimatedSlippageUsd: avail(usd, {
        estimated: true,
        note: "illustrative_only",
      }),
      method: "spread_proxy" as const,
      disclaimer: SLIPPAGE_DISCLAIMER,
    };
  });
}
