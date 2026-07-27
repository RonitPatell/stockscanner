/**
 * Tradeability Engine fixtures — entry/exit realism only, never direction.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeTradeability,
  recomputeTradeability,
  estimateIllustrativeSlippage,
  computeTradeabilityMetrics,
  hasLicensedL1Depth,
  __resetTradeabilityStoreForTests,
  saveTradeabilityResult,
  listTradeabilityTransitions,
  SLIPPAGE_DISCLAIMER,
} from "../src/lib/tradeability/index.ts";

test("liquid large caps → LIQUID", () => {
  const r = computeTradeability({
    symbol: "AAPL",
    floatSource: "vendor",
    hasLicensedDepth: true,
    tape: {
      price: 190,
      bid: 189.98,
      ask: 190.02,
      bidSize: 5000,
      askSize: 4800,
      quoteAgeSec: 1,
      volume: 40_000_000,
      avgVolume: 50_000_000,
      rVol: 0.8,
      floatShares: 15_000_000_000,
      dollarVolume: 190 * 40_000_000,
      dayMoveAbsPct: 1.2,
    },
  });
  assert.equal(r.class, "LIQUID");
  assert.ok(r.explanation.includes("LIQUID"));
  assert.ok(!r.explanation.toLowerCase().includes("will rise"));
  assert.ok(r.disclaimer.toLowerCase().includes("never claims"));
});

test("thin low-float securities → THIN or EXTREMELY_THIN", () => {
  const r = computeTradeability({
    symbol: "TINY",
    floatSource: "profile_heuristic",
    hasLicensedDepth: false,
    tape: {
      price: 0.85,
      bid: 0.82,
      ask: 0.88,
      quoteAgeSec: 5,
      volume: 800_000,
      avgVolume: 200_000,
      rVol: 4,
      floatShares: 2_500_000,
      dollarVolume: 0.85 * 800_000,
      dayMoveAbsPct: 18,
    },
  });
  assert.ok(r.class === "THIN" || r.class === "EXTREMELY_THIN");
  assert.ok(r.warnings.some((w) => w.flag === "FLOAT_UNCERTAIN" && w.active));
  assert.ok(r.warnings.some((w) => w.flag === "WIDE_SPREAD" && w.active));
  assert.ok(r.warnings.some((w) => w.flag === "INSUFFICIENT_DEPTH" && w.active));
});

test("stale quotes block LIQUID and set STALE_QUOTE", () => {
  const r = computeTradeability({
    symbol: "STALE",
    hasLicensedDepth: true,
    tape: {
      price: 50,
      bid: 49.99,
      ask: 50.01,
      bidSize: 2000,
      askSize: 2000,
      quoteAgeSec: 90,
      dollarVolume: 50_000_000,
      floatShares: 100_000_000,
    },
  });
  assert.notEqual(r.class, "LIQUID");
  assert.ok(r.warnings.some((w) => w.flag === "STALE_QUOTE" && w.active));
});

test("wide spreads → EXTREMELY_THIN or WIDE_SPREAD", () => {
  const r = computeTradeability({
    symbol: "WIDE",
    tape: {
      price: 2,
      bid: 1.9,
      ask: 2.2,
      quoteAgeSec: 2,
      dollarVolume: 3_000_000,
      floatShares: 30_000_000,
    },
  });
  // 3000 bps-ish? (0.3/2)*10000 = 1500 bps → extremely thin
  assert.equal(r.class, "EXTREMELY_THIN");
  assert.ok(r.warnings.some((w) => w.flag === "WIDE_SPREAD" && w.active));
});

test("market halts cap tradeability and set HALT_RISK", () => {
  const r = computeTradeability({
    symbol: "HALT",
    hasLicensedDepth: true,
    tape: {
      price: 25,
      bid: 24.99,
      ask: 25.01,
      bidSize: 1000,
      askSize: 1000,
      quoteAgeSec: 1,
      dollarVolume: 30_000_000,
      floatShares: 80_000_000,
      haltCount: 2,
    },
  });
  assert.ok(r.class === "THIN" || r.class === "EXTREMELY_THIN");
  assert.ok(r.warnings.some((w) => w.flag === "HALT_RISK" && w.active));
});

test("missing depth data never invents depth estimates", () => {
  assert.equal(hasLicensedL1Depth({ override: false }), false);
  const m = computeTradeabilityMetrics({
    symbol: "NODEPTH",
    hasLicensedDepth: false,
    tape: {
      price: 10,
      bid: 9.99,
      ask: 10.01,
      bidSize: 999, // present but not entitled
      askSize: 999,
      dollarVolume: 5_000_000,
    },
  });
  assert.equal(m.hasLicensedDepth, false);
  assert.equal(m.bidSize.availability, "unavailable");
  assert.ok((m.bidSize.note ?? "").includes("licensed"));
  assert.ok(m.missingInputs.includes("licensed_l1_depth"));

  const slip = estimateIllustrativeSlippage({
    metrics: m,
    orderNotionalsUsd: [5_000],
    price: 10,
  });
  assert.equal(slip[0]!.method, "spread_proxy");
  assert.ok(slip[0]!.disclaimer.includes("illustrative"));
  assert.equal(slip[0]!.disclaimer, SLIPPAGE_DISCLAIMER);
});

test("UNKNOWN when critical market data missing", () => {
  const r = computeTradeability({
    symbol: "EMPTY",
    tape: {},
  });
  assert.equal(r.class, "UNKNOWN");
  assert.ok(r.warnings.some((w) => w.flag === "MARKET_DATA_UNAVAILABLE" && w.active));
  assert.ok(r.metrics.missingInputs.length > 0);
});

test("hysteresis prevents LIQUID↔ACCEPTABLE flicker", () => {
  const first = computeTradeability({
    symbol: "FLAP",
    tape: {
      price: 40,
      bid: 39.99,
      ask: 40.01,
      quoteAgeSec: 1,
      dollarVolume: 25_000_000,
      floatShares: 200_000_000,
    },
  });
  assert.equal(first.class, "LIQUID");

  const flapped = recomputeTradeability(
    {
      symbol: "FLAP",
      nowMs: Date.parse(first.computedAt) + 5_000,
      tape: {
        price: 40,
        bid: 39.98,
        ask: 40.02,
        quoteAgeSec: 1,
        dollarVolume: 8_000_000, // still acceptable band
        floatShares: 200_000_000,
      },
    },
    first
  );
  // Downgrade is immediate
  assert.equal(flapped.class, "ACCEPTABLE");

  const upgradeAttempt = recomputeTradeability(
    {
      symbol: "FLAP",
      nowMs: Date.parse(flapped.computedAt) + 5_000,
      tape: {
        price: 40,
        bid: 39.99,
        ask: 40.01,
        quoteAgeSec: 1,
        dollarVolume: 25_000_000,
        floatShares: 200_000_000,
      },
    },
    flapped
  );
  assert.equal(upgradeAttempt.flappedSuppressed, true);
  assert.equal(upgradeAttempt.class, "ACCEPTABLE");
});

test("persist transitions for historical evaluation", async () => {
  __resetTradeabilityStoreForTests();
  const a = computeTradeability({
    symbol: "HIST",
    tape: {
      price: 10,
      bid: 9.99,
      ask: 10.01,
      quoteAgeSec: 1,
      dollarVolume: 25_000_000,
    },
  });
  await saveTradeabilityResult(a);
  const b = computeTradeability({
    symbol: "HIST",
    previousClass: a.class,
    previousClassAtMs: Date.parse(a.computedAt) - 60_000,
    tape: {
      price: 10,
      bid: 9.5,
      ask: 10.5,
      quoteAgeSec: 1,
      dollarVolume: 100_000,
    },
  });
  const { transitionRecorded } = await saveTradeabilityResult({
    ...b,
    previousClass: a.class,
  });
  assert.equal(transitionRecorded, true);
  const rows = await listTradeabilityTransitions("HIST", 10);
  assert.ok(rows.some((r) => r.toClass === "EXTREMELY_THIN"));
});

test("user-configurable illustrative notionals appear in slippage rows", () => {
  const r = computeTradeability({
    symbol: "SIZE",
    illustrativeOrderNotionalsUsd: [2_500, 10_000],
    tape: {
      price: 20,
      bid: 19.98,
      ask: 20.02,
      quoteAgeSec: 1,
      dollarVolume: 10_000_000,
    },
  });
  assert.equal(r.illustrativeSlippage.length, 2);
  assert.equal(r.illustrativeSlippage[0]!.orderNotionalUsd, 2_500);
  assert.ok(r.illustrativeSlippage[0]!.disclaimer.includes("not execution guarantees"));
});

test("EXTENDED_FROM_EVENT warning when day move large", () => {
  const r = computeTradeability({
    symbol: "EXT",
    tape: {
      price: 5,
      bid: 4.99,
      ask: 5.01,
      quoteAgeSec: 1,
      dollarVolume: 8_000_000,
      dayMoveAbsPct: 22,
    },
  });
  assert.ok(r.warnings.some((w) => w.flag === "EXTENDED_FROM_EVENT" && w.active));
});
