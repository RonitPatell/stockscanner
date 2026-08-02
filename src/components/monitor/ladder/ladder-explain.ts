import type {
  LeaderHysteresisState,
  PriorityLadderRow,
  RankExplainBreakdown,
} from "./ladder-types.ts";

export interface ExplainInput {
  momentumIntensity: number;
  catalystUrgency: number; // 0–100
  haltOrRiskUrgency: number;
  onWatchlist: boolean;
  strategyMatch: boolean;
  dataConfidenceWarning: boolean;
  dataFreshnessMs: number | null;
  pinned: boolean;
  hysteresis: LeaderHysteresisState;
  challengerSymbol?: string | null;
}

/**
 * Build explain-rank breakdown. Never invents expected return / win probability.
 */
export function buildRankExplain(input: ExplainInput): RankExplainBreakdown {
  const momentumContribution = round1(
    Math.max(0, Math.min(100, input.momentumIntensity)) * 0.28
  );
  const catalystUrgency = round1(
    Math.max(0, Math.min(100, input.catalystUrgency)) * 0.22
  );
  const haltOrRiskUrgency = round1(
    Math.max(0, Math.min(100, input.haltOrRiskUrgency)) * 0.35
  );
  let personalRelevance = 0;
  if (input.onWatchlist) personalRelevance += 16;
  if (input.strategyMatch) personalRelevance += 18;
  personalRelevance = round1(personalRelevance);

  let dataQualityAdjustment = 0;
  if (input.dataConfidenceWarning) dataQualityAdjustment -= 10;
  if (input.dataFreshnessMs != null && input.dataFreshnessMs > 15_000) {
    dataQualityAdjustment -= 18;
  } else if (input.dataFreshnessMs != null && input.dataFreshnessMs > 5_000) {
    dataQualityAdjustment -= 8;
  }
  dataQualityAdjustment = round1(dataQualityAdjustment);

  const leaderHysteresisDetail = hysteresisDetail(input);

  const lines: RankExplainBreakdown["lines"] = [
    {
      label: "Momentum contribution",
      value: `Intensity ${Math.round(input.momentumIntensity)} → inspection weight`,
      points: momentumContribution,
    },
    {
      label: "Catalyst urgency",
      value:
        input.catalystUrgency > 0
          ? `Catalyst urgency ${Math.round(input.catalystUrgency)}`
          : "No verified catalyst urgency",
      points: catalystUrgency,
    },
    {
      label: "Halt or risk urgency",
      value:
        input.haltOrRiskUrgency > 0
          ? `Halt/risk urgency ${Math.round(input.haltOrRiskUrgency)}`
          : "No elevated halt/risk urgency",
      points: haltOrRiskUrgency,
    },
    {
      label: "Personal relevance",
      value: personalLine(input),
      points: personalRelevance,
    },
    {
      label: "Data-quality adjustment",
      value:
        dataQualityAdjustment < 0
          ? "Stale or low-confidence data reduced inspection priority"
          : "No data-quality penalty",
      points: dataQualityAdjustment,
    },
    {
      label: "Leader hysteresis",
      value: leaderHysteresisDetail,
      points: 0,
    },
  ];

  return {
    momentumContribution,
    catalystUrgency,
    haltOrRiskUrgency,
    personalRelevance,
    dataQualityAdjustment,
    leaderHysteresis: input.hysteresis,
    leaderHysteresisDetail,
    lines,
  };
}

function personalLine(input: ExplainInput): string {
  const bits: string[] = [];
  if (input.onWatchlist) bits.push("watchlist");
  if (input.strategyMatch) bits.push("strategy match");
  if (bits.length === 0) return "Not on watchlist / no strategy match";
  return bits.join(" + ");
}

function hysteresisDetail(input: ExplainInput): string {
  switch (input.hysteresis) {
    case "pinned":
      return "User-pinned — automatic leader selection disabled";
    case "stable_leader":
      return "Current leader — no active challenger";
    case "challenger_pending":
      return input.challengerSymbol
        ? `Challenger ${input.challengerSymbol} pending margin/hold`
        : "Challenger pending margin/hold";
    case "margin_hold":
      return "Waiting for challenge margin to persist";
    case "min_hold":
      return "Minimum leader-hold period active";
    case "critical_bypass":
      return "Critical halt/risk/catalyst bypassed hysteresis";
    case "not_leader":
    default:
      return "Not the current leader";
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Map a row + leader context into explain breakdown. */
export function explainFromRow(
  row: Pick<
    PriorityLadderRow,
    | "symbol"
    | "momentumIntensity"
    | "hasCatalyst"
    | "catalystVerified"
    | "risk"
    | "halted"
    | "onWatchlist"
    | "strategyMatch"
    | "dataConfidenceWarning"
    | "dataFreshnessMs"
    | "pinned"
    | "criticalEvent"
  >,
  opts: {
    leaderSymbol: string | null;
    challengerSymbol: string | null;
    hysteresis: LeaderHysteresisState;
  }
): RankExplainBreakdown {
  const catalystUrgency =
    row.hasCatalyst && row.catalystVerified
      ? row.criticalEvent
        ? 92
        : 70
      : row.hasCatalyst
        ? 25
        : 0;
  const haltOrRiskUrgency = row.halted
    ? 90
    : row.risk === "critical"
      ? 85
      : row.risk === "high"
        ? 70
        : row.risk === "medium"
          ? 40
          : 0;

  let hysteresis = opts.hysteresis;
  if (row.pinned && opts.leaderSymbol === row.symbol) hysteresis = "pinned";
  else if (opts.leaderSymbol !== row.symbol) hysteresis = "not_leader";
  else if (row.criticalEvent) hysteresis = "critical_bypass";

  return buildRankExplain({
    momentumIntensity: row.momentumIntensity,
    catalystUrgency,
    haltOrRiskUrgency,
    onWatchlist: row.onWatchlist,
    strategyMatch: row.strategyMatch,
    dataConfidenceWarning: row.dataConfidenceWarning,
    dataFreshnessMs: row.dataFreshnessMs,
    pinned: row.pinned,
    hysteresis,
    challengerSymbol: opts.challengerSymbol,
  });
}
