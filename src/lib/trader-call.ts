/**
 * Plain-language day-trader call for a catalyst + live tape.
 * Informational only — not a buy/sell recommendation.
 */

export type TraderCallKind = "LOOK" | "WAIT" | "SKIP" | "WATCH";

export interface TraderCallInput {
  changePercent: number | null | undefined;
  moveSincePub: number | null | undefined;
  stage: string | null | undefined;
  riskLabels: string[];
  dollarVolume: number | null | undefined;
  rvol: number | null | undefined;
}

export interface TraderCallResult {
  kind: TraderCallKind;
  title: string;
  reason: string;
  /** One-line action for the desk */
  nextStep: string;
}

function hasHighRisk(labels: string[]): boolean {
  return labels.some((l) =>
    /dilut|offering|halt|illiquid|spread|toxic|going.?concern/i.test(l)
  );
}

/**
 * Simple rules a day trader can scan in under 2 seconds.
 */
export function buildTraderCall(input: TraderCallInput): TraderCallResult {
  const session = input.changePercent ?? null;
  const move = input.moveSincePub ?? session;
  const absMove = move != null ? Math.abs(move) : null;
  const stage = (input.stage || "").toUpperCase();
  const risky = hasHighRisk(input.riskLabels);
  const thin =
    (input.dollarVolume != null && input.dollarVolume < 250_000) ||
    (input.rvol != null && input.rvol < 0.8);

  if (risky) {
    return {
      kind: "SKIP",
      title: "Skip — risk flags",
      reason: "Primary risk flags are active (dilution, halt, or liquidity).",
      nextStep: "Read the risk section before sizing anything.",
    };
  }

  if (stage === "STALE") {
    return {
      kind: "SKIP",
      title: "Skip — tape is stale",
      reason: "Reaction stage is stale; the first move likely already happened.",
      nextStep: "Wait for a fresh catalyst on this name.",
    };
  }

  if (stage === "EXTENDED" || (absMove != null && absMove >= 12)) {
    return {
      kind: "WAIT",
      title: "Wait — already extended",
      reason:
        absMove != null
          ? `Move is about ${absMove.toFixed(1)}% — chasing late is how accounts get hurt.`
          : "Stage is extended; late entry risk is high.",
      nextStep: "Only consider if you have a clear pullback plan — not FOMO.",
    };
  }

  if (thin) {
    return {
      kind: "WATCH",
      title: "Watch — thin tape",
      reason: "Dollar volume or RVol is light; fills and exits can be ugly.",
      nextStep: "Keep on watch until volume confirms.",
    };
  }

  if (stage === "EARLY" || stage === "ACTIVE" || (absMove != null && absMove < 8)) {
    return {
      kind: "LOOK",
      title: "Look now",
      reason:
        absMove != null
          ? `Live move ~${move! >= 0 ? "+" : ""}${absMove.toFixed(1)}% with an early/active tape.`
          : "Early/active stage — check chart + risks, then decide.",
      nextStep: "Open the 1m chart, confirm liquidity, then decide your risk.",
    };
  }

  return {
    kind: "WATCH",
    title: "Watch",
    reason: "Not enough tape yet to call look vs wait.",
    nextStep: "Stay on the row until price and volume update.",
  };
}
