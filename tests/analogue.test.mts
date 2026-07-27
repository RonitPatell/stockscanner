/**
 * Historical Catalyst Analogue Engine — fixtures.
 * Descriptive evidence only; no expected profit / target / P(success).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustPriceForSplits,
  resolveSymbolAsOf,
  isCorruptCandlePath,
  buildFeatureVector,
  buildEventOutcome,
  isBeforeQuery,
  findAnalogues,
  buildAnalogueReport,
  aggregateAnalogueStats,
  detectAnalogueBias,
  DEFAULT_CRITERIA,
  LOOSE_CRITERIA,
  TIGHT_CRITERIA,
  ANALOGUE_DISCLAIMER,
  ANALOGUE_ENGINE_VERSION,
  type AnalogueEventOutcome,
  type AnalogueFeatureVector,
  type CorporateActionFactor,
} from "../src/lib/analogue/index.ts";

function feat(
  over: Partial<AnalogueFeatureVector> &
    Pick<AnalogueFeatureVector, "catalystId" | "symbol" | "ingestedAt">
): AnalogueFeatureVector {
  return {
    publishedAt: over.ingestedAt,
    category: "fda",
    subtype: "fda_event",
    implication: "POSITIVE",
    sourceTier: "wire",
    marketSession: "regular",
    priceBucket: "low",
    floatBucket: "micro",
    liquidityBucket: "moderate",
    rvolBucket: "elevated",
    gapBucket: "medium",
    reactionStage: "EARLY",
    sector: "Healthcare",
    dilutionStatus: "clean",
    marketRegime: "unknown",
    classificationVersion: "judgment-v2.0",
    entryPrice: 3.5,
    delistedOrChanged: false,
    splitAdjusted: false,
    excludeReason: null,
    ...over,
  };
}

function outcome(
  over: Partial<AnalogueEventOutcome> & Pick<AnalogueEventOutcome, "catalystId">
): AnalogueEventOutcome {
  return {
    symbol: "X",
    returns: {
      m1: 1,
      m3: 2,
      m5: 2.5,
      m15: 3,
      m30: 2,
      m60: 1.5,
      close: 1,
      next_open: 0.5,
    },
    mfePct: 5,
    maePct: -2,
    stayedAboveEntry: true,
    fellBelowFiveMin: false,
    medianSpreadPct: 0.4,
    liquidityDollarVol: 1_500_000,
    halted: false,
    valid: true,
    invalidReason: null,
    ...over,
  };
}

test("split-adjusted prices apply known factors", () => {
  const factors: CorporateActionFactor[] = [
    {
      symbol: "ABCD",
      effectiveAt: "2025-06-01T00:00:00Z",
      splitFactor: 0.1, // 1-for-10 reverse → multiply old prices by 0.1? 
      // Convention: multiply historical pre-split prices by factor to bring forward.
      // 1-for-10 reverse: old $10 becomes $1 → factor 0.1
      note: "1-for-10 reverse",
    },
  ];
  const adj = adjustPriceForSplits({
    symbol: "ABCD",
    historicalPrice: 10,
    historicalAt: "2025-01-15T15:00:00Z",
    referenceAt: "2025-07-01T15:00:00Z",
    factors,
  });
  assert.equal(adj.excluded, false);
  assert.equal(adj.adjusted, true);
  assert.ok(adj.price != null && Math.abs(adj.price - 1) < 1e-9);
});

test("unlisted split suspect excludes corrupted path", () => {
  const adj = adjustPriceForSplits({
    symbol: "ZZZZ",
    historicalPrice: 10,
    historicalAt: "2025-01-01T00:00:00Z",
    factors: [],
    referencePrice: 1.0, // ~10x reverse without factor
  });
  assert.equal(adj.excluded, true);
  assert.equal(adj.reason, "split_adjust_suspect_unlisted");
});

test("delisted symbols resolve and flag change", () => {
  const factors: CorporateActionFactor[] = [
    {
      symbol: "OLD",
      effectiveAt: "2025-03-01T00:00:00Z",
      splitFactor: 1,
      delisted: true,
      note: "delisted no successor",
    },
  ];
  const r = resolveSymbolAsOf({
    symbol: "OLD",
    asOf: "2025-06-01T00:00:00Z",
    factors,
  });
  assert.equal(r.delisted, true);

  const before = resolveSymbolAsOf({
    symbol: "OLD",
    asOf: "2025-01-01T00:00:00Z",
    factors,
  });
  assert.equal(before.delisted, false);
});

test("corrupt candles detected; missing candles invalid outcome", () => {
  assert.equal(
    isCorruptCandlePath([{ o: 1, h: 1.1, l: 0.9, c: 1 }]),
    false
  );
  assert.equal(
    isCorruptCandlePath([{ o: 0, h: 1, l: 0.5, c: 0.8 }]),
    true
  );
  assert.equal(isCorruptCandlePath([]), true);

  const o = buildEventOutcome({
    catalystId: "c1",
    symbol: "X",
    metrics: [],
    dataComplete: false,
  });
  assert.equal(o.valid, false);
  assert.ok(o.invalidReason);
});

test("after-hours events bucket to afterhours session", () => {
  // 2026-07-22 21:00 UTC = 17:00 ET summer → afterhours
  const v = buildFeatureVector({
    catalystId: "ah1",
    symbol: "AH",
    headline: "Company announces FDA approval after close",
    publishedAt: "2026-07-22T21:00:00Z",
    ingestedAt: "2026-07-22T21:05:00Z",
    catalystType: "fda",
    price: 4,
    floatShares: 8e6,
    changePercent: 6,
  });
  assert.equal(v.marketSession, "afterhours");
  assert.equal(v.subtype, "fda_event");
});

test("no look-ahead: future candidates excluded", () => {
  const query = feat({
    catalystId: "q",
    symbol: "Q",
    ingestedAt: "2026-06-01T15:00:00Z",
  });
  const past = {
    features: feat({
      catalystId: "p1",
      symbol: "P1",
      ingestedAt: "2026-05-01T15:00:00Z",
    }),
    outcome: outcome({ catalystId: "p1", symbol: "P1" }),
  };
  const future = {
    features: feat({
      catalystId: "f1",
      symbol: "F1",
      ingestedAt: "2026-07-01T15:00:00Z",
    }),
    outcome: outcome({ catalystId: "f1", symbol: "F1" }),
  };
  assert.equal(isBeforeQuery(past.features.ingestedAt, query.ingestedAt), true);
  assert.equal(isBeforeQuery(future.features.ingestedAt, query.ingestedAt), false);

  const found = findAnalogues({
    query,
    corpus: [past, future],
    criteria: LOOSE_CRITERIA,
  });
  assert.equal(found.matches.length, 1);
  assert.equal(found.matches[0]!.features.catalystId, "p1");
});

test("changed classification version still matches on frozen labels", () => {
  const query = feat({
    catalystId: "q",
    symbol: "Q",
    ingestedAt: "2026-06-01T15:00:00Z",
    classificationVersion: "judgment-v2.0",
  });
  const oldRule = {
    features: feat({
      catalystId: "old",
      symbol: "OLD",
      ingestedAt: "2025-01-01T15:00:00Z",
      classificationVersion: "judgment-v1.0",
      category: "fda",
      implication: "POSITIVE",
    }),
    outcome: outcome({ catalystId: "old", symbol: "OLD" }),
  };
  const found = findAnalogues({
    query,
    corpus: [oldRule],
    criteria: DEFAULT_CRITERIA,
  });
  assert.equal(found.matches.length, 1);
  assert.ok(
    found.matches[0]!.whyComparable.some((w) =>
      w.includes("historical classification")
    )
  );
});

test("small samples labelled; no success probability fields", () => {
  const query = feat({
    catalystId: "q",
    symbol: "Q",
    ingestedAt: "2026-06-01T15:00:00Z",
  });
  const corpus = Array.from({ length: 3 }, (_, i) => ({
    features: feat({
      catalystId: `c${i}`,
      symbol: `S${i}`,
      ingestedAt: `2026-0${i + 1}-01T15:00:00Z`,
    }),
    outcome: outcome({ catalystId: `c${i}`, symbol: `S${i}` }),
  }));
  const report = buildAnalogueReport({
    query,
    corpus,
    criteria: LOOSE_CRITERIA,
  });
  assert.ok(report.stats.insufficientSample);
  assert.ok(report.stats.smallSampleLabel?.toLowerCase().includes("small"));
  assert.ok(report.disclaimer.includes("not an expected profit"));
  assert.ok(!("probabilityOfSuccess" in report.stats));
  assert.ok(!("expectedProfit" in report.stats));
  assert.ok(!("targetPrice" in report.stats));
  assert.equal(report.engineVersion, ANALOGUE_ENGINE_VERSION);
  assert.ok(ANALOGUE_DISCLAIMER.length > 20);

  // Tightening reduces sample
  const tight = buildAnalogueReport({
    query,
    corpus,
    criteria: TIGHT_CRITERIA,
  });
  assert.ok(
    (report.sampleSizeIfTighter ?? 0) <= report.stats.sampleSize ||
      tight.stats.sampleSize <= report.stats.sampleSize
  );
});

test("aggregate horizons include close and next_open", () => {
  const matches = findAnalogues({
    query: feat({
      catalystId: "q",
      symbol: "Q",
      ingestedAt: "2026-12-01T15:00:00Z",
    }),
    corpus: [
      {
        features: feat({
          catalystId: "a",
          symbol: "A",
          ingestedAt: "2026-01-01T15:00:00Z",
        }),
        outcome: outcome({ catalystId: "a", symbol: "A" }),
      },
    ],
    criteria: LOOSE_CRITERIA,
  }).matches;
  const stats = aggregateAnalogueStats(matches);
  const keys = stats.horizons.map((h) => h.horizon);
  assert.ok(keys.includes("m1"));
  assert.ok(keys.includes("m60"));
  assert.ok(keys.includes("close"));
  assert.ok(keys.includes("next_open"));
});

test("bias detector flags low outcome coverage and version mix", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    catalystId: `c${i}`,
    symbol: `S${i}`,
    ingestedAt: new Date(Date.UTC(2025, i % 12, 1)).toISOString(),
    category: "fda",
    delistedOrChanged: i < 5,
    eligibleUrgent: true,
    excludeReason: i % 7 === 0 ? "missing_candles" : null,
    dataComplete: i % 3 !== 0,
    hasOutcome: i % 3 !== 0,
    classificationVersion: i < 20 ? "judgment-v1.0" : "judgment-v2.0",
    marketSession: i % 5 === 0 ? "afterhours" : "regular",
    sourceTier: i % 2 === 0 ? "wire" : "blog",
  }));
  const bias = detectAnalogueBias(rows);
  assert.ok(bias.selectionFlags.length >= 1);
  assert.ok(bias.byClassificationVersion.length === 2);
  assert.ok(bias.disclaimer.toLowerCase().includes("bias"));
});

test("feature vector excludes missing price", () => {
  const v = buildFeatureVector({
    catalystId: "x",
    symbol: "X",
    headline: "News",
    publishedAt: "2026-01-01T15:00:00Z",
    ingestedAt: "2026-01-01T15:01:00Z",
    price: null,
  });
  assert.equal(v.excludeReason, "missing_price");
});
