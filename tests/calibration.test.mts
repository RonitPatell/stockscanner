import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyEligibility,
  classifyPriceJump,
  wilsonInterval,
  median,
} from "../src/lib/calibration/buckets.ts";
import {
  computeExcursions,
  priceAtTarget,
  qualityForQuoteAge,
  rawReturnPct,
  relativeReturnPct,
  type CandleSet,
} from "../src/lib/calibration/candles.ts";
import { computeHorizonMetrics, snapshotUsable } from "../src/lib/calibration/metrics.ts";
import {
  buildCalibrationReport,
  publicCalibrationSummary,
} from "../src/lib/calibration/report.ts";
import type { OutcomeRowForReport } from "../src/lib/calibration/report.ts";
import type { PriceSnapshot } from "../src/lib/calibration/types.ts";
import { MIN_SAMPLE_FOR_PRECISION } from "../src/lib/calibration/types.ts";

function bars(
  startSec: number,
  prices: number[],
  opts?: { gap?: boolean }
): CandleSet {
  const out = [];
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i]!;
    const t = startSec + i * 60;
    out.push({
      t,
      o: p,
      h: p * 1.01,
      l: p * 0.99,
      c: p,
      v: 10_000 + i * 100,
    });
  }
  if (opts?.gap && prices.length >= 2) {
    // leave a hole by removing middle bar — already sequential; add halt window instead
  }
  return { bars: out };
}

test("missing candles → MISSING snapshot, no silent fill", () => {
  const empty: CandleSet = { bars: [] };
  const snap = priceAtTarget(empty, 1_700_000_000, { horizon: "m5" });
  assert.equal(snap.price, null);
  assert.equal(snap.quality, "MISSING");
  assert.equal(snap.substituted, false);
});

test("next candle substitution is always labelled", () => {
  const start = 1_700_000_000;
  // Candles only at +90s and later — target has no exact bar
  const set: CandleSet = {
    bars: [
      { t: start + 90, o: 10, h: 10.2, l: 9.9, c: 10.1, v: 1000 },
      { t: start + 150, o: 10.1, h: 10.3, l: 10, c: 10.2, v: 1100 },
    ],
  };
  const snap = priceAtTarget(set, start, { horizon: "m1", maxSubstituteLagSec: 180 });
  assert.equal(snap.substituted, true);
  assert.equal(snap.quality, "SUBSTITUTED_NEXT");
  assert.equal(snap.substituteLagSec, 90);
  assert.ok(snap.note?.includes("substituted"));
});

test("substitute beyond max lag stays MISSING", () => {
  const start = 1_700_000_000;
  const set: CandleSet = {
    bars: [{ t: start + 400, o: 10, h: 10, l: 10, c: 10.5, v: 1 }],
  };
  const snap = priceAtTarget(set, start, { horizon: "m1", maxSubstituteLagSec: 90 });
  assert.equal(snap.price, null);
  assert.equal(snap.quality, "MISSING");
  assert.ok(snap.note?.includes("exceeds"));
});

test("halt window marks HALTED and blocks metrics", () => {
  const start = 1_700_000_000;
  const set: CandleSet = {
    bars: [{ t: start + 60, o: 10, h: 10, l: 10, c: 10, v: 1 }],
    haltWindows: [[start, start + 300]],
  };
  const snap = priceAtTarget(set, start + 60, { horizon: "m1" });
  assert.equal(snap.quality, "HALTED");
  assert.equal(snap.price, null);

  const entry: PriceSnapshot = {
    horizon: "ingest",
    price: 10,
    observedAt: new Date(start * 1000).toISOString(),
    targetAt: new Date(start * 1000).toISOString(),
    source: "quote_cache",
    quality: "EXACT",
    substituted: false,
    substituteLagSec: null,
    volume: 1000,
    spreadPct: null,
  };
  const m = computeHorizonMetrics({
    horizon: "m1",
    entry,
    exit: snap,
    spyEntry: null,
    spyExit: null,
    sectorEntry: null,
    sectorExit: null,
  });
  assert.equal(m.sampleValid, false);
  assert.equal(m.invalidReason, "halted");
});

test("split-suspect ratio flags SPLIT_ADJUST_SUSPECT", () => {
  assert.equal(classifyPriceJump(10, 20, 60), "SPLIT_ADJUST_SUSPECT");
  assert.equal(classifyPriceJump(10, 1, 60), "SPLIT_ADJUST_SUSPECT");
  assert.equal(classifyPriceJump(10, 10.5, 60), null);
});

test("extreme gap within 2 minutes flagged", () => {
  assert.equal(classifyPriceJump(10, 15, 60), "GAP_EXTREME");
  assert.equal(classifyPriceJump(10, 12, 60), null);
});

test("stale quotes excluded from usable snapshots", () => {
  const now = Date.now();
  assert.equal(qualityForQuoteAge(now - 120_000, now, 90), "STALE");
  assert.equal(qualityForQuoteAge(now - 10_000, now, 90), "EXACT");

  const stale: PriceSnapshot = {
    horizon: "ingest",
    price: 5,
    observedAt: new Date(now - 120_000).toISOString(),
    targetAt: new Date(now).toISOString(),
    source: "quote_cache",
    quality: "STALE",
    substituted: false,
    substituteLagSec: null,
    volume: null,
    spreadPct: null,
  };
  assert.equal(snapshotUsable(stale), false);
});

test("MFE / MAE from candle highs and lows", () => {
  const start = 1_700_000_000;
  const set = bars(start, [10, 10.5, 9.5, 10.2]);
  // Adjust h/l for clearer excursions
  set.bars[1]!.h = 11;
  set.bars[2]!.l = 9;
  const { mfePct, maePct } = computeExcursions(set, 10, start, start + 180);
  assert.ok(mfePct != null && mfePct >= 10);
  assert.ok(maePct != null && maePct <= -10);
});

test("raw and SPY-relative returns", () => {
  assert.equal(rawReturnPct(10, 11), 10);
  assert.equal(relativeReturnPct(10, 2), 8);
  assert.equal(relativeReturnPct(10, null), null);
});

test("scheduled and stale stories excluded from urgent cohort", () => {
  const sched = classifyEligibility({
    headline: "Company scheduled to report earnings on Tuesday",
    publishedAt: new Date(),
  });
  assert.equal(sched.eligibleUrgent, false);
  assert.equal(sched.excludeReason, "scheduled");

  const stale = classifyEligibility({
    headline: "As previously announced, update on prior guidance",
    publishedAt: new Date(),
  });
  assert.equal(stale.eligibleUrgent, false);
  assert.equal(stale.excludeReason, "stale");

  const fresh = classifyEligibility({
    headline: "FDA clears new indication",
    publishedAt: new Date(),
  });
  assert.equal(fresh.eligibleUrgent, true);
});

test("wilson CI and low sample flags", () => {
  const ci = wilsonInterval(8, 10);
  assert.ok(ci);
  assert.ok(ci!.low < 0.8 && ci!.high > 0.8);

  const rows: OutcomeRowForReport[] = Array.from({ length: 5 }, (_, i) => ({
    catalystType: "fda",
    sourceTier: "wire",
    strength: "STRONG",
    confidenceBucket: "high",
    floatBucket: "micro",
    liquidityBucket: "thin",
    marketSession: "regular",
    eligibleUrgent: true,
    rawReturnPct: 2 + i * 0.1,
    spyRelativePct: 1,
    directionHit: true,
  }));
  const report = buildCalibrationReport(rows);
  const overall = report.cohorts.find((c) => c.dimension === "overall")!;
  assert.equal(overall.insufficientSample, true);
  assert.ok(overall.n < MIN_SAMPLE_FOR_PRECISION);

  const publicReport = publicCalibrationSummary(report);
  // overall kept even if small
  assert.ok(publicReport.cohorts.some((c) => c.dimension === "overall"));
});

test("calibration report shows precision and sample size", () => {
  const rows: OutcomeRowForReport[] = Array.from({ length: 25 }, (_, i) => ({
    catalystType: i % 2 ? "fda" : "earnings",
    sourceTier: "wire",
    strength: "MODERATE",
    confidenceBucket: "medium",
    floatBucket: "small",
    liquidityBucket: "moderate",
    marketSession: i % 3 === 0 ? "premarket" : "regular",
    eligibleUrgent: i !== 0, // one excluded
    rawReturnPct: i % 4 === 0 ? 0.2 : 2.5,
    spyRelativePct: 0.5,
    directionHit: i % 5 !== 0,
  }));
  const report = buildCalibrationReport(rows, { reactionThresholdPct: 1 });
  const overall = report.cohorts.find((c) => c.dimension === "overall")!;
  assert.ok(overall.n >= 20);
  assert.ok(overall.precision != null);
  assert.ok(overall.ciLow != null && overall.ciHigh != null);
  assert.equal(overall.insufficientSample, false);
  assert.ok(report.cohorts.some((c) => c.dimension === "marketSession"));
  assert.ok(report.cohorts.some((c) => c.dimension === "floatBucket"));
});

test("median helper", () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([]), null);
});
