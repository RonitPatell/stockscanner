import {
  adjacentInOrder,
  FLOAT_ORDER,
  GAP_ORDER,
  IMPLICATION_ADJACENT,
  LIQ_ORDER,
  PRICE_ORDER,
  RVOL_ORDER,
  SESSION_ORDER,
} from "./buckets.ts";
import { isBeforeQuery } from "./features.ts";
import type {
  AnalogueEventOutcome,
  AnalogueFeatureVector,
  AnalogueMatch,
  AnalogueMatchCriteria,
  MatchStrictness,
} from "./types.ts";
import {
  DEFAULT_CRITERIA,
  LOOSE_CRITERIA,
  TIGHT_CRITERIA,
} from "./types.ts";

const SOURCE_TIER_ORDER = ["wire", "exchange", "aggregator", "blog", "unknown"] as const;

function dimMatch(
  strictness: MatchStrictness,
  queryVal: string | null | undefined,
  candVal: string | null | undefined,
  opts?: {
    adjacent?: (a: string, b: string) => boolean;
    allowNullAsUnknown?: boolean;
  }
): boolean {
  if (strictness === "any") return true;
  const q = (queryVal ?? "unknown").toLowerCase();
  const c = (candVal ?? "unknown").toLowerCase();
  if (strictness === "exact") return q === c;
  // adjacent
  if (q === c) return true;
  if (opts?.adjacent) return opts.adjacent(q, c);
  return false;
}

function implicationMatch(
  strictness: MatchStrictness,
  q: AnalogueFeatureVector["implication"],
  c: AnalogueFeatureVector["implication"]
): boolean {
  if (strictness === "any") return true;
  if (strictness === "exact") return q === c;
  return IMPLICATION_ADJACENT[q]?.includes(c) ?? q === c;
}

export interface MatchDimensionResult {
  dimension: string;
  matched: boolean;
  relaxed: boolean;
  reason: string;
}

export function evaluateDimensions(
  query: AnalogueFeatureVector,
  candidate: AnalogueFeatureVector,
  criteria: AnalogueMatchCriteria
): MatchDimensionResult[] {
  return [
    {
      dimension: "category",
      matched: dimMatch(criteria.category, query.category, candidate.category),
      relaxed: criteria.category !== "exact",
      reason: `category ${candidate.category} vs ${query.category}`,
    },
    {
      dimension: "subtype",
      matched: dimMatch(criteria.subtype, query.subtype, candidate.subtype),
      relaxed: criteria.subtype !== "exact",
      reason: `subtype ${candidate.subtype ?? "—"} vs ${query.subtype ?? "—"}`,
    },
    {
      dimension: "implication",
      matched: implicationMatch(
        criteria.implication,
        query.implication,
        candidate.implication
      ),
      relaxed: criteria.implication !== "exact",
      reason: `implication ${candidate.implication} vs ${query.implication}`,
    },
    {
      dimension: "sourceTier",
      matched: dimMatch(
        criteria.sourceTier,
        query.sourceTier,
        candidate.sourceTier,
        {
          adjacent: (a, b) =>
            adjacentInOrder(SOURCE_TIER_ORDER, a, b),
        }
      ),
      relaxed: criteria.sourceTier !== "exact",
      reason: `source ${candidate.sourceTier ?? "—"} vs ${query.sourceTier ?? "—"}`,
    },
    {
      dimension: "marketSession",
      matched: dimMatch(
        criteria.marketSession,
        String(query.marketSession),
        String(candidate.marketSession),
        {
          adjacent: (a, b) => adjacentInOrder(SESSION_ORDER, a, b),
        }
      ),
      relaxed: criteria.marketSession !== "exact",
      reason: `session ${candidate.marketSession} vs ${query.marketSession}`,
    },
    {
      dimension: "priceBucket",
      matched: dimMatch(
        criteria.priceBucket,
        query.priceBucket,
        candidate.priceBucket,
        { adjacent: (a, b) => adjacentInOrder(PRICE_ORDER, a, b) }
      ),
      relaxed: criteria.priceBucket !== "exact",
      reason: `price bucket ${candidate.priceBucket} vs ${query.priceBucket}`,
    },
    {
      dimension: "floatBucket",
      matched: dimMatch(
        criteria.floatBucket,
        query.floatBucket,
        candidate.floatBucket,
        { adjacent: (a, b) => adjacentInOrder(FLOAT_ORDER, a, b) }
      ),
      relaxed: criteria.floatBucket !== "exact",
      reason: `float ${candidate.floatBucket} vs ${query.floatBucket}`,
    },
    {
      dimension: "liquidityBucket",
      matched: dimMatch(
        criteria.liquidityBucket,
        query.liquidityBucket,
        candidate.liquidityBucket,
        { adjacent: (a, b) => adjacentInOrder(LIQ_ORDER, a, b) }
      ),
      relaxed: criteria.liquidityBucket !== "exact",
      reason: `liquidity ${candidate.liquidityBucket} vs ${query.liquidityBucket}`,
    },
    {
      dimension: "rvolBucket",
      matched: dimMatch(
        criteria.rvolBucket,
        query.rvolBucket,
        candidate.rvolBucket,
        { adjacent: (a, b) => adjacentInOrder(RVOL_ORDER, a, b) }
      ),
      relaxed: criteria.rvolBucket !== "exact",
      reason: `RVol ${candidate.rvolBucket} vs ${query.rvolBucket}`,
    },
    {
      dimension: "gapBucket",
      matched: dimMatch(
        criteria.gapBucket,
        query.gapBucket,
        candidate.gapBucket,
        { adjacent: (a, b) => adjacentInOrder(GAP_ORDER, a, b) }
      ),
      relaxed: criteria.gapBucket !== "exact",
      reason: `gap ${candidate.gapBucket} vs ${query.gapBucket}`,
    },
    {
      dimension: "reactionStage",
      matched: dimMatch(
        criteria.reactionStage,
        query.reactionStage,
        candidate.reactionStage
      ),
      relaxed: criteria.reactionStage !== "exact",
      reason: `reaction stage ${candidate.reactionStage} vs ${query.reactionStage}`,
    },
    {
      dimension: "sector",
      matched: dimMatch(criteria.sector, query.sector, candidate.sector),
      relaxed: criteria.sector !== "exact",
      reason: `sector ${candidate.sector ?? "—"} vs ${query.sector ?? "—"}`,
    },
    {
      dimension: "dilutionStatus",
      matched: dimMatch(
        criteria.dilutionStatus,
        query.dilutionStatus,
        candidate.dilutionStatus,
        {
          adjacent: (a, b) =>
            a === b ||
            a === "unknown" ||
            b === "unknown" ||
            (a === "clean" && b === "unknown"),
        }
      ),
      relaxed: criteria.dilutionStatus !== "exact",
      reason: `dilution ${candidate.dilutionStatus} vs ${query.dilutionStatus}`,
    },
    {
      dimension: "marketRegime",
      matched: dimMatch(
        criteria.marketRegime,
        query.marketRegime,
        candidate.marketRegime
      ),
      relaxed: criteria.marketRegime !== "exact",
      reason: `regime ${candidate.marketRegime} vs ${query.marketRegime}`,
    },
  ];
}

export function matchCandidate(
  query: AnalogueFeatureVector,
  candidate: AnalogueFeatureVector,
  outcome: AnalogueEventOutcome,
  criteria: AnalogueMatchCriteria
): AnalogueMatch | null {
  if (!isBeforeQuery(candidate.ingestedAt, query.ingestedAt)) {
    return null;
  }
  if (candidate.excludeReason) return null;
  if (!outcome.valid) return null;
  // Same catalyst never matches itself
  if (candidate.catalystId === query.catalystId) return null;

  const dims = evaluateDimensions(query, candidate, criteria);
  if (dims.some((d) => !d.matched)) return null;

  const matchedDimensions = dims
    .filter((d) => d.matched && criteria[d.dimension as keyof AnalogueMatchCriteria] !== "any")
    .map((d) => d.dimension);
  const relaxedDimensions = dims
    .filter((d) => d.relaxed && d.matched)
    .map((d) => d.dimension);

  const exactHits = dims.filter(
    (d) =>
      d.matched &&
      criteria[d.dimension as keyof AnalogueMatchCriteria] === "exact"
  ).length;
  const score = exactHits * 10 + matchedDimensions.length - relaxedDimensions.length * 0.5;

  const whyComparable = dims
    .filter((d) => d.matched && criteria[d.dimension as keyof AnalogueMatchCriteria] !== "any")
    .map((d) => d.reason);

  if (candidate.splitAdjusted) {
    whyComparable.push("prices split-adjusted with known corporate-action factor");
  }
  if (candidate.delistedOrChanged) {
    whyComparable.push(
      "symbol later delisted or changed — outcome captured before change"
    );
  }
  if (
    candidate.classificationVersion &&
    query.classificationVersion &&
    candidate.classificationVersion !== query.classificationVersion
  ) {
    whyComparable.push(
      `historical classification ${candidate.classificationVersion} (query uses ${query.classificationVersion}) — matched on frozen event-time labels`
    );
  }

  return {
    features: candidate,
    outcome,
    whyComparable,
    matchedDimensions,
    relaxedDimensions,
    score,
  };
}

export function findAnalogues(opts: {
  query: AnalogueFeatureVector;
  corpus: Array<{
    features: AnalogueFeatureVector;
    outcome: AnalogueEventOutcome;
  }>;
  criteria?: AnalogueMatchCriteria;
  limit?: number;
}): {
  matches: AnalogueMatch[];
  candidatesScanned: number;
  excludedCount: number;
} {
  const criteria = opts.criteria ?? DEFAULT_CRITERIA;
  let excludedCount = 0;
  const matches: AnalogueMatch[] = [];

  for (const row of opts.corpus) {
    if (
      row.features.excludeReason ||
      !row.outcome.valid ||
      !isBeforeQuery(row.features.ingestedAt, opts.query.ingestedAt)
    ) {
      excludedCount++;
      continue;
    }
    const m = matchCandidate(
      opts.query,
      row.features,
      row.outcome,
      criteria
    );
    if (m) matches.push(m);
    else excludedCount++;
  }

  matches.sort((a, b) => b.score - a.score);
  const limit = opts.limit ?? 100;
  return {
    matches: matches.slice(0, limit),
    candidatesScanned: opts.corpus.length,
    excludedCount,
  };
}

export function criteriaPreset(
  c: AnalogueMatchCriteria
): "tight" | "default" | "loose" | "custom" {
  if (JSON.stringify(c) === JSON.stringify(TIGHT_CRITERIA)) return "tight";
  if (JSON.stringify(c) === JSON.stringify(DEFAULT_CRITERIA)) return "default";
  if (JSON.stringify(c) === JSON.stringify(LOOSE_CRITERIA)) return "loose";
  return "custom";
}

/** Loosen every non-any exact→adjacent, adjacent→any */
export function loosenCriteria(c: AnalogueMatchCriteria): AnalogueMatchCriteria {
  const next = { ...c };
  for (const k of Object.keys(next) as (keyof AnalogueMatchCriteria)[]) {
    if (next[k] === "exact") next[k] = "adjacent";
    else if (next[k] === "adjacent") next[k] = "any";
  }
  return next;
}

export function tightenCriteria(c: AnalogueMatchCriteria): AnalogueMatchCriteria {
  const next = { ...c };
  for (const k of Object.keys(next) as (keyof AnalogueMatchCriteria)[]) {
    if (next[k] === "any") next[k] = "adjacent";
    else if (next[k] === "adjacent") next[k] = "exact";
  }
  return next;
}
