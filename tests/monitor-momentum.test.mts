/**
 * Momentum Engine V1 — fixture tests (deterministic, no trade advice).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { SymbolMarketState } from "../src/domain/monitor/market-state/types.ts";
import { unavailable, ok, flagged } from "../src/domain/monitor/market-state/field.ts";
import {
  MONITOR_MOMENTUM_VERSION,
  MomentumEngine,
  MemoryMomentumSnapshotStore,
  SymbolBaseline,
  sampleFromFeatures,
  scoreFromMarketState,
  extractFeatures,
  median,
  mad,
  robustZ,
  winsorize,
} from "../src/domain/monitor/momentum/index.ts";

const AS_OF = Date.parse("2026-07-27T15:00:00.000Z"); // regular session ET

function emptyWindow(window: SymbolMarketState["windows"]["w5s"]["window"], windowMs: number) {
  const u = unavailable<number>("fixture");
  return {
    window,
    windowMs,
    lastPrice: u,
    priceReturn: u,
    priceVelocity: u,
    priceAcceleration: u,
    tradeCount: ok(0),
    tradesPerSecond: ok(0),
    tradeRateAcceleration: u,
    shareVolumeVelocity: ok(0),
    dollarVolumeVelocity: ok(0),
    buySellImbalance: u,
    high: u,
    low: u,
    realizedVolatility: u,
  };
}

function baseState(over: Partial<SymbolMarketState> = {}): SymbolMarketState {
  const windows = {
    w5s: emptyWindow("w5s", 5_000),
    w15s: emptyWindow("w15s", 15_000),
    w30s: emptyWindow("w30s", 30_000),
    w1m: emptyWindow("w1m", 60_000),
    w3m: emptyWindow("w3m", 180_000),
    w5m: emptyWindow("w5m", 300_000),
    session: emptyWindow("session", 0),
  };
  return {
    symbol: "FIX",
    calcVersion: "monitor-market-state-v1.0",
    asOfMs: AS_OF,
    lastPrice: ok(10),
    dataFreshnessMs: ok(200),
    haltState: ok({ halted: false, reason: null, sinceMs: null }),
    windows,
    quote: {
      quoteUpdateRate: ok(0.5),
      spreadDollars: ok(0.02),
      spreadBps: ok(20),
      spreadChange: ok(0),
      bidSize: ok(500),
      askSize: ok(500),
      quoteFlags: [],
    },
    session: {
      segment: "regular",
      sessionDate: "2026-07-27",
      hod: ok(10.5),
      lod: ok(9.5),
      distanceFromHod: ok((10 - 10.5) / 10.5),
      distanceFromLod: ok((10 - 9.5) / 9.5),
      vwap: ok(10),
      distanceFromVwap: ok(0),
      relativeVolume: ok(0.3),
      turnoverVsFloat: unavailable("fixture"),
    },
    ...over,
  };
}

function patchWindow(
  state: SymbolMarketState,
  key: keyof SymbolMarketState["windows"],
  patch: Record<string, unknown>
): void {
  state.windows[key] = { ...state.windows[key], ...patch } as typeof state.windows.w5s;
}

function warmBaseline(
  template: SymbolMarketState,
  n: number,
  mutate: (s: SymbolMarketState, i: number) => void
): SymbolBaseline {
  const b = new SymbolBaseline(128);
  for (let i = 0; i < n; i++) {
    const s = structuredClone(template);
    s.asOfMs = AS_OF - (n - i) * 15_000;
    mutate(s, i);
    b.push(sampleFromFeatures(extractFeatures(s)));
  }
  return b;
}

test("version pinned", () => {
  assert.equal(MONITOR_MOMENTUM_VERSION, "monitor-momentum-v1.0");
});

test("robust stats: median/MAD/winsorize resist extremes", () => {
  const xs = [1, 2, 2, 3, 1000];
  assert.equal(median(xs), 2);
  assert.ok((mad(xs) ?? 0) < 5);
  assert.equal(winsorize(1000, 0, 10), 10);
  const z = robustZ(1000, xs);
  assert.ok(z != null && z > 0);
});

test("fixture: dormant stock → low intensity", () => {
  const state = baseState();
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.00001),
    priceAcceleration: ok(0),
    tradesPerSecond: ok(0.02),
    tradeRateAcceleration: ok(0),
    shareVolumeVelocity: ok(10),
    dollarVolumeVelocity: ok(100),
    tradeCount: ok(3),
  });
  patchWindow(state, "w1m", { tradeCount: ok(6) });
  state.session.relativeVolume = ok(0.05);

  const baseline = warmBaseline(state, 20, (s) => {
    patchWindow(s, "w15s", {
      priceVelocity: ok(0.00001),
      tradesPerSecond: ok(0.02),
      shareVolumeVelocity: ok(10),
      dollarVolumeVelocity: ok(100),
      tradeCount: ok(3),
    });
    s.session.relativeVolume = ok(0.05);
  });

  const r = scoreFromMarketState(state, {
    baseline,
    ref: { avgDailyVolume: 5_000_000, floatConfidence: "high" },
    nowMs: AS_OF,
  });
  assert.ok(r.momentumIntensity < 25, `dormant intensity ${r.momentumIntensity}`);
  assert.notEqual(r.confidence, "UNAVAILABLE");
  assert.match(r.explanation, /not trade attractiveness/i);
});

test("fixture: gradual build → rising intensity, sustained quality", () => {
  const engine = new MomentumEngine({
    snapshotIntervalMs: 999_999,
    now: () => AS_OF,
  });
  engine.setReference("GRAD", {
    avgDailyVolume: 2_000_000,
    floatShares: 40_000_000,
    floatConfidence: "medium",
  });

  let last = 0;
  for (let i = 0; i < 30; i++) {
    const state = baseState({ symbol: "GRAD", asOfMs: AS_OF + i * 1000 });
    const tps = 0.2 + i * 0.15;
    const vel = 0.001 + i * 0.0008;
    patchWindow(state, "w15s", {
      priceVelocity: ok(vel),
      priceAcceleration: ok(0.0001 * i),
      tradesPerSecond: ok(tps),
      tradeRateAcceleration: ok(0.01 * i),
      shareVolumeVelocity: ok(500 + i * 200),
      dollarVolumeVelocity: ok(5000 + i * 2000),
      tradeCount: ok(3 + i),
      buySellImbalance: ok(0.2),
    });
    patchWindow(state, "w5s", {
      priceAcceleration: ok(0.0001 * i),
      tradeRateAcceleration: ok(0.01 * i),
      tradeCount: ok(2 + Math.floor(i / 2)),
    });
    patchWindow(state, "w1m", { tradeCount: ok(10 + i * 2) });
    state.lastPrice = ok(10 + i * 0.02);
    state.session.relativeVolume = ok(0.2 + i * 0.05);
    state.session.distanceFromVwap = ok(0.001 * i);
    state.session.distanceFromHod = ok(-0.02 + i * 0.0005);
    state.quote.quoteUpdateRate = ok(1 + i * 0.1);
    last = engine.evaluate(state).momentumIntensity;
  }
  const final = engine.evaluate(
    (() => {
      const state = baseState({ symbol: "GRAD", asOfMs: AS_OF + 31_000 });
      patchWindow(state, "w15s", {
        priceVelocity: ok(0.03),
        priceAcceleration: ok(0.004),
        tradesPerSecond: ok(5),
        tradeRateAcceleration: ok(0.4),
        shareVolumeVelocity: ok(8000),
        dollarVolumeVelocity: ok(80_000),
        tradeCount: ok(40),
        buySellImbalance: ok(0.3),
      });
      patchWindow(state, "w5s", {
        priceAcceleration: ok(0.004),
        tradeRateAcceleration: ok(0.4),
        tradeCount: ok(15),
      });
      patchWindow(state, "w1m", { tradeCount: ok(90) });
      state.session.relativeVolume = ok(2.5);
      state.quote.quoteUpdateRate = ok(8);
      return state;
    })()
  );
  assert.ok(final.momentumIntensity > 40, `gradual ${final.momentumIntensity}`);
  const sustained = final.components.find(
    (c) => c.id === "sustainedParticipationQuality"
  );
  assert.ok(sustained && sustained.intensity > 40);
  assert.ok(last >= 0);
});

test("fixture: sudden one-print spike does not max score", () => {
  const quiet = baseState({ symbol: "SPIKE" });
  patchWindow(quiet, "w15s", {
    priceVelocity: ok(0.0001),
    tradesPerSecond: ok(0.05),
    shareVolumeVelocity: ok(20),
    dollarVolumeVelocity: ok(200),
    tradeCount: ok(1),
  });
  patchWindow(quiet, "w1m", { tradeCount: ok(2) });

  const baseline = warmBaseline(quiet, 30, (s) => {
    patchWindow(s, "w15s", {
      priceVelocity: ok(0.0001),
      tradesPerSecond: ok(0.05),
      dollarVolumeVelocity: ok(200),
      tradeCount: ok(1),
    });
  });

  const spike = structuredClone(quiet);
  spike.asOfMs = AS_OF;
  patchWindow(spike, "w15s", {
    priceVelocity: ok(50), // absurd single-print-driven velocity
    priceAcceleration: ok(20),
    tradesPerSecond: ok(0.07),
    tradeCount: ok(1),
    shareVolumeVelocity: ok(100),
    dollarVolumeVelocity: ok(5000),
  });
  patchWindow(spike, "w5s", {
    priceVelocity: ok(50),
    priceAcceleration: ok(20),
    tradeCount: ok(1),
  });
  spike.session.distanceFromVwap = ok(0.5);

  const r = scoreFromMarketState(spike, {
    baseline,
    ref: { avgDailyVolume: 1_000_000 },
    nowMs: AS_OF,
  });
  assert.ok(
    r.momentumIntensity < 100,
    `one-print must not hit 100: ${r.momentumIntensity}`
  );
  assert.ok(
    r.dataQualityPenalties.some((p) => p.code === "single_print_guard"),
    "expected single_print_guard penalty"
  );
  const pv = r.components.find((c) => c.id === "priceVelocity");
  assert.ok(pv?.note?.includes("component_share_capped") || (pv?.contribution ?? 0) < 40);
});

test("fixture: genuine sustained acceleration → high intensity + confidence", () => {
  const state = baseState({ symbol: "ACCEL" });
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.05),
    priceAcceleration: ok(0.01),
    tradesPerSecond: ok(8),
    tradeRateAcceleration: ok(1.2),
    shareVolumeVelocity: ok(20_000),
    dollarVolumeVelocity: ok(200_000),
    tradeCount: ok(60),
    buySellImbalance: ok(0.4),
  });
  patchWindow(state, "w5s", {
    priceAcceleration: ok(0.012),
    tradeRateAcceleration: ok(1.5),
    tradeCount: ok(25),
    priceVelocity: ok(0.06),
  });
  patchWindow(state, "w1m", { tradeCount: ok(180) });
  state.session.relativeVolume = ok(4);
  state.session.distanceFromHod = ok(-0.001);
  state.session.distanceFromVwap = ok(0.02);
  state.quote.quoteUpdateRate = ok(12);

  const baseline = warmBaseline(state, 40, (s, i) => {
    patchWindow(s, "w15s", {
      priceVelocity: ok(0.002 + i * 0.00005),
      tradesPerSecond: ok(0.5 + i * 0.02),
      dollarVolumeVelocity: ok(5000 + i * 100),
      tradeCount: ok(5 + i),
    });
    s.session.relativeVolume = ok(0.4);
  });

  const r = scoreFromMarketState(state, {
    baseline,
    ref: { avgDailyVolume: 3_000_000 },
    nowMs: AS_OF,
  });
  assert.ok(r.momentumIntensity >= 50, `sustained ${r.momentumIntensity}`);
  assert.ok(r.confidence === "HIGH" || r.confidence === "MEDIUM");
  assert.equal(r.direction, "up");
  assert.ok(r.signedMomentum > 0);
  assert.ok(
    (r.components.find((c) => c.id === "sustainedParticipationQuality")
      ?.intensity ?? 0) > 50
  );
});

test("fixture: downward momentum is visible (not hidden)", () => {
  const state = baseState({ symbol: "DOWN" });
  patchWindow(state, "w15s", {
    priceVelocity: ok(-0.04),
    priceAcceleration: ok(-0.008),
    tradesPerSecond: ok(6),
    tradeRateAcceleration: ok(0.8),
    shareVolumeVelocity: ok(15_000),
    dollarVolumeVelocity: ok(150_000),
    tradeCount: ok(45),
    buySellImbalance: ok(-0.5),
  });
  patchWindow(state, "w5s", {
    priceAcceleration: ok(-0.01),
    tradeRateAcceleration: ok(0.9),
    tradeCount: ok(18),
  });
  patchWindow(state, "w1m", { tradeCount: ok(120) });
  state.session.relativeVolume = ok(3);
  state.session.distanceFromLod = ok(0.001);
  state.session.distanceFromHod = ok(-0.08);
  state.session.distanceFromVwap = ok(-0.03);
  state.quote.quoteUpdateRate = ok(10);

  const baseline = warmBaseline(state, 40, (s) => {
    patchWindow(s, "w15s", {
      priceVelocity: ok(-0.001),
      tradesPerSecond: ok(0.6),
      dollarVolumeVelocity: ok(4000),
      tradeCount: ok(8),
    });
  });

  const r = scoreFromMarketState(state, {
    baseline,
    ref: { avgDailyVolume: 2_500_000 },
    nowMs: AS_OF,
  });
  assert.equal(r.direction, "down");
  assert.ok(r.signedMomentum < 0, `signed ${r.signedMomentum}`);
  assert.ok(r.momentumIntensity > 30);
  assert.match(r.explanation, /downward/i);
});

test("fixture: wide-spread low-volume stock → quality penalty, not trading risk", () => {
  const state = baseState({ symbol: "WIDE" });
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.01),
    tradesPerSecond: ok(0.1),
    tradeCount: ok(2),
    dollarVolumeVelocity: ok(500),
    shareVolumeVelocity: ok(50),
  });
  patchWindow(state, "w1m", { tradeCount: ok(3) });
  state.quote.spreadBps = ok(400);
  state.quote.spreadDollars = ok(0.4);
  state.session.relativeVolume = ok(0.1);

  const r = scoreFromMarketState(state, {
    ref: { avgDailyVolume: 40_000 },
    nowMs: AS_OF,
  });
  assert.ok(
    r.dataQualityPenalties.some((p) => p.code === "wide_spread_low_volume")
  );
  assert.ok(r.liquidityBucket === "ultra_thin" || r.liquidityBucket === "thin");
  for (const p of r.dataQualityPenalties) {
    assert.doesNotMatch(p.detail, /profit|buy|sell|recommend/i);
  }
});

test("fixture: stale market data → confidence UNAVAILABLE or heavy penalty", () => {
  const state = baseState({ symbol: "STALE" });
  state.dataFreshnessMs = ok(60_000);
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.02),
    tradesPerSecond: ok(3),
    tradeCount: ok(20),
    dollarVolumeVelocity: ok(50_000),
  });
  const r = scoreFromMarketState(state, { nowMs: AS_OF });
  assert.ok(
    r.confidence === "UNAVAILABLE" ||
      r.dataQualityPenalties.some((p) => p.code === "hard_stale" || p.code === "stale")
  );
  assert.ok(r.sourceDataAgeMs === 60_000);
});

test("fixture: halted stock → intensity 0, confidence UNAVAILABLE", () => {
  const state = baseState({ symbol: "HALT" });
  state.haltState = ok({
    halted: true,
    reason: "T1",
    sinceMs: AS_OF - 60_000,
  });
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.1),
    tradesPerSecond: ok(20),
    tradeCount: ok(100),
    dollarVolumeVelocity: ok(1_000_000),
  });
  const r = scoreFromMarketState(state, { nowMs: AS_OF });
  assert.equal(r.momentumIntensity, 0);
  assert.equal(r.confidence, "UNAVAILABLE");
  assert.equal(r.direction, "unavailable");
  assert.ok(r.dataQualityPenalties.some((p) => p.code === "halted"));
});

test("fixture: market-open burst uses open_auction config dampening", () => {
  const state = baseState({ symbol: "OPEN" });
  state.session.segment = "open_auction";
  patchWindow(state, "w15s", {
    priceVelocity: ok(0.02),
    tradesPerSecond: ok(15),
    tradeRateAcceleration: ok(3),
    tradeCount: ok(80),
    dollarVolumeVelocity: ok(300_000),
    shareVolumeVelocity: ok(30_000),
  });
  patchWindow(state, "w5s", {
    tradeRateAcceleration: ok(3),
    tradeCount: ok(40),
  });
  patchWindow(state, "w1m", { tradeCount: ok(200) });
  state.session.relativeVolume = ok(1.2);

  const engine = new MomentumEngine({ snapshotIntervalMs: 999_999 });
  const openCfg = engine.sessionConfig("open_auction");
  assert.ok(openCfg.openBurstTradeRateScale < 1);

  const baseline = warmBaseline(state, 20, (s) => {
    s.session.segment = "open_auction";
    patchWindow(s, "w15s", {
      tradesPerSecond: ok(2),
      priceVelocity: ok(0.002),
      dollarVolumeVelocity: ok(20_000),
      tradeCount: ok(15),
    });
  });

  const r = scoreFromMarketState(state, {
    baseline,
    config: openCfg,
    ref: { avgDailyVolume: 5_000_000 },
    nowMs: AS_OF,
  });
  assert.equal(r.session, "open_auction");
  // Trade-rate weight dampened — intensity still computed, not advice.
  assert.ok(r.momentumIntensity >= 0 && r.momentumIntensity <= 100);
  assert.ok(r.calcVersion === MONITOR_MOMENTUM_VERSION);
  assert.ok(r.calculatedAt);
});

test("snapshots persist only at controlled cadence", () => {
  const store = new MemoryMomentumSnapshotStore();
  let now = AS_OF;
  const engine = new MomentumEngine({
    snapshotStore: store,
    snapshotIntervalMs: 1_000,
    now: () => now,
  });

  for (let i = 0; i < 5; i++) {
    now = AS_OF + i * 100;
    const state = baseState({ symbol: "CADENCE", asOfMs: now });
    patchWindow(state, "w15s", {
      tradesPerSecond: ok(1),
      tradeCount: ok(5),
      priceVelocity: ok(0.001),
    });
    engine.evaluate(state);
  }
  // 400ms elapsed — no flush yet from construct at AS_OF
  assert.equal(store.putCount(), 0);

  now = AS_OF + 1_500;
  const state = baseState({ symbol: "CADENCE", asOfMs: now });
  patchWindow(state, "w15s", {
    tradesPerSecond: ok(1),
    tradeCount: ok(5),
    priceVelocity: ok(0.001),
  });
  engine.evaluate(state);
  assert.ok(store.putCount() >= 1);
  assert.ok(store.get("CADENCE"));
});

test("missing inputs listed; no sentiment fields", () => {
  const state = baseState({ symbol: "MISS" });
  // Leave most windows unavailable
  const r = scoreFromMarketState(state, { nowMs: AS_OF });
  assert.ok(Array.isArray(r.missingInputs));
  assert.ok(r.components.every((c) => typeof c.id === "string"));
  const blob = JSON.stringify(r);
  assert.doesNotMatch(blob, /sentiment|winrate|edge|recommend|buy_signal/i);
});

test("flagged crossed quote adds data-quality penalty", () => {
  const state = baseState();
  state.quote.spreadDollars = flagged( -0.01, "crossed_quote");
  state.quote.quoteFlags = ["crossed"];
  patchWindow(state, "w15s", {
    tradesPerSecond: ok(2),
    tradeCount: ok(10),
    priceVelocity: ok(0.01),
  });
  const r = scoreFromMarketState(state, { nowMs: AS_OF });
  assert.ok(r.dataQualityPenalties.some((p) => p.code === "quote_quality"));
});
