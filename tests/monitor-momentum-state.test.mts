/**
 * Momentum State Machine — permitted/prohibited transitions + path fixtures.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_STATES,
  MONITOR_MOMENTUM_STATE_VERSION,
  MomentumStateMachineEngine,
  PROHIBITED_EXAMPLES,
  assertProhibited,
  isPermittedTransition,
  permittedTargets,
  seedMemory,
  stepMachine,
  resolveThresholds,
} from "../src/domain/monitor/momentum-state/index.ts";
import type {
  MomentumLifecycleState,
  MomentumStateInput,
} from "../src/domain/monitor/momentum-state/index.ts";

const T0 = Date.parse("2026-07-27T15:00:00.000Z");

function input(
  over: Partial<MomentumStateInput> & { asOfMs: number }
): MomentumStateInput {
  return {
    symbol: "MSM",
    momentumIntensity: 40,
    momentumIntensitySlope: 1,
    priceDirection: "up",
    priceAcceleration: 0.001,
    participationScore: 40,
    hodLodInteraction: "mid_range",
    reactionStage: "developing",
    halted: false,
    resumptionDataReliable: false,
    sourceDataAgeMs: 200,
    session: "regular",
    liquidityCohort: "moderate",
    ...over,
  };
}

function drive(
  from: MomentumLifecycleState,
  atMs: number,
  patch: Partial<MomentumStateInput>,
  dwellPadMs = 5_000
) {
  const mem = seedMemory(from, atMs - dwellPadMs, 40);
  return stepMachine(mem, input({ asOfMs: atMs, ...patch }));
}

test("version pinned", () => {
  assert.equal(MONITOR_MOMENTUM_STATE_VERSION, "monitor-momentum-state-v1.0");
});

test("thresholds vary by session and liquidity cohort", () => {
  const reg = resolveThresholds("regular", "moderate");
  const open = resolveThresholds("open_auction", "ultra_thin");
  assert.ok(open.breakingMin > reg.breakingMin);
  assert.ok(open.intensityHysteresis > reg.intensityHysteresis);
  assert.ok((open.dwellMs.BREAKING ?? 0) > (reg.dwellMs.BREAKING ?? 0));
});

test("matrix: every prohibited example is blocked", () => {
  for (const ex of PROHIBITED_EXAMPLES) {
    assert.equal(
      assertProhibited(ex.from, ex.to),
      true,
      `${ex.from}→${ex.to} should be prohibited (${ex.reason})`
    );
    assert.equal(isPermittedTransition(ex.from, ex.to), false);
  }
});

test("matrix: every listed permitted target is allowed", () => {
  for (const from of ALL_STATES) {
    for (const to of permittedTargets(from)) {
      assert.equal(
        isPermittedTransition(from, to),
        true,
        `${from}→${to} should be permitted`
      );
    }
  }
});

test("matrix: self-transitions always allowed", () => {
  for (const s of ALL_STATES) {
    assert.equal(isPermittedTransition(s, s), true);
  }
});

test("any state → HALTED (override)", () => {
  for (const from of ALL_STATES) {
    const { snapshot, transition } = drive(from, T0, {
      halted: true,
      momentumIntensity: 90,
    });
    assert.equal(snapshot.state, "HALTED", `${from}→HALTED`);
    if (from !== "HALTED") {
      assert.ok(transition);
      assert.equal(transition!.to, "HALTED");
      assert.equal(transition!.calcVersion, MONITOR_MOMENTUM_STATE_VERSION);
      assert.ok(
        transition!.evidence.some((e) => e.code === "override_halt")
      );
    }
  }
});

test("stale data → UNKNOWN from calculated states", () => {
  for (const from of [
    "DORMANT",
    "EMERGING",
    "BUILDING",
    "BREAKING",
    "ACTIVE",
    "COOLING",
    "FADING",
    "RECLAIMING",
  ] as MomentumLifecycleState[]) {
    const { snapshot, transition } = drive(from, T0, {
      sourceDataAgeMs: 60_000,
      momentumIntensity: 70,
    });
    assert.equal(snapshot.state, "UNKNOWN", `${from}→UNKNOWN on stale`);
    assert.ok(transition);
    assert.match(snapshot.explanation, /stale|cannot be classified/i);
  }
});

test("path: Emerging → Building", () => {
  const { snapshot, transition } = drive("EMERGING", T0, {
    momentumIntensity: 40,
    momentumIntensitySlope: 2,
    participationScore: 35,
    priceDirection: "up",
  });
  assert.equal(snapshot.state, "BUILDING");
  assert.equal(transition?.from, "EMERGING");
  assert.equal(transition?.to, "BUILDING");
  assert.doesNotMatch(snapshot.explanation, /\b(buy|sell)\b/i);
});

test("path: Building → Breaking", () => {
  const { snapshot, transition } = drive("BUILDING", T0, {
    momentumIntensity: 55,
    momentumIntensitySlope: 3.5,
    participationScore: 40,
    priceAcceleration: 0.01,
    priceDirection: "up",
    hodLodInteraction: "near_hod",
  });
  assert.equal(snapshot.state, "BREAKING");
  assert.equal(transition?.from, "BUILDING");
  assert.equal(transition?.to, "BREAKING");
});

test("path: Breaking → Active", () => {
  const { snapshot, transition } = drive("BREAKING", T0, {
    momentumIntensity: 65,
    momentumIntensitySlope: 0.5,
    participationScore: 50,
    reactionStage: "developing",
    priceDirection: "up",
  });
  assert.equal(snapshot.state, "ACTIVE");
  assert.equal(transition?.from, "BREAKING");
  assert.equal(transition?.to, "ACTIVE");
});

test("path: Active → Cooling", () => {
  const { snapshot, transition } = drive("ACTIVE", T0, {
    momentumIntensity: 50,
    momentumIntensitySlope: -2,
    participationScore: 40,
  });
  assert.equal(snapshot.state, "COOLING");
  assert.equal(transition?.from, "ACTIVE");
  assert.equal(transition?.to, "COOLING");
  assert.doesNotMatch(snapshot.explanation, /\b(buy|sell)\b/i);
});

test("path: Cooling → Reclaiming", () => {
  const { snapshot, transition } = drive("COOLING", T0, {
    momentumIntensity: 35,
    momentumIntensitySlope: 1.2,
    participationScore: 25,
  });
  assert.equal(snapshot.state, "RECLAIMING");
  assert.equal(transition?.from, "COOLING");
  assert.equal(transition?.to, "RECLAIMING");
});

test("path: Cooling → Fading", () => {
  const { snapshot, transition } = drive("COOLING", T0, {
    momentumIntensity: 10,
    momentumIntensitySlope: -3,
    participationScore: 8,
  });
  assert.equal(snapshot.state, "FADING");
  assert.equal(transition?.from, "COOLING");
  assert.equal(transition?.to, "FADING");
});

test("Halted → Unknown before reliable resumption data", () => {
  const { snapshot, transition } = drive("HALTED", T0, {
    halted: false,
    resumptionDataReliable: false,
    momentumIntensity: 40,
    sourceDataAgeMs: 200,
  });
  assert.equal(snapshot.state, "UNKNOWN");
  assert.equal(transition?.from, "HALTED");
  assert.equal(transition?.to, "UNKNOWN");
  assert.ok(
    transition!.evidence.some((e) => e.code === "override_post_halt")
  );
});

test("Halted cannot jump to Active even with strong tape", () => {
  const { snapshot } = drive("HALTED", T0, {
    halted: false,
    resumptionDataReliable: false,
    momentumIntensity: 90,
    momentumIntensitySlope: 5,
    participationScore: 80,
  });
  assert.equal(snapshot.state, "UNKNOWN");
  assert.equal(isPermittedTransition("HALTED", "ACTIVE"), false);
});

test("after reliable resumption, UNKNOWN can enter EMERGING not ACTIVE", () => {
  const mem = seedMemory("UNKNOWN", T0 - 1_000, 20);
  const { snapshot } = stepMachine(
    mem,
    input({
      asOfMs: T0,
      halted: false,
      resumptionDataReliable: true,
      momentumIntensity: 25,
      momentumIntensitySlope: 1.5,
      participationScore: 20,
    })
  );
  assert.ok(["EMERGING", "DORMANT", "COOLING", "FADING", "BUILDING"].includes(snapshot.state));
  assert.notEqual(snapshot.state, "ACTIVE");
  assert.notEqual(snapshot.state, "BREAKING");
});

test("dwell time prevents flicker Emerging→Building", () => {
  const mem = seedMemory("EMERGING", T0, 25);
  const early = stepMachine(
    mem,
    input({
      asOfMs: T0 + 200, // < 1000ms dwell
      momentumIntensity: 40,
      momentumIntensitySlope: 2,
      participationScore: 35,
    })
  );
  assert.equal(early.snapshot.state, "EMERGING");
  assert.equal(early.transition, null);
  assert.ok(early.snapshot.evidence.some((e) => e.code === "dwell_hold"));

  const later = stepMachine(
    early.memory,
    input({
      asOfMs: T0 + 2_000,
      momentumIntensity: 40,
      momentumIntensitySlope: 2,
      participationScore: 35,
    })
  );
  assert.equal(later.snapshot.state, "BUILDING");
});

test("hysteresis: prohibited DORMANT→ACTIVE blocked even if proposed", () => {
  assert.equal(isPermittedTransition("DORMANT", "ACTIVE"), false);
  // Engine stays DORMANT when intensity spikes without path — propose may say EMERGING
  const { snapshot } = drive("DORMANT", T0, {
    momentumIntensity: 90,
    momentumIntensitySlope: 5,
    participationScore: 80,
  });
  assert.notEqual(snapshot.state, "ACTIVE");
  assert.ok(snapshot.state === "EMERGING" || snapshot.state === "DORMANT");
});

test("incremental engine records transitions with evidence + version", () => {
  const engine = new MomentumStateMachineEngine();
  let t = T0;
  engine.update(
    input({
      asOfMs: t,
      momentumIntensity: 5,
      momentumIntensitySlope: 0,
      participationScore: 5,
    })
  );
  t += 2_000;
  const r = engine.update(
    input({
      asOfMs: t,
      momentumIntensity: 22,
      momentumIntensitySlope: 2,
      participationScore: 20,
    })
  );
  assert.equal(r.snapshot.calcVersion, MONITOR_MOMENTUM_STATE_VERSION);
  assert.ok(r.snapshot.explanation.length > 20);
  assert.doesNotMatch(r.snapshot.explanation, /opportunity|recommend/i);

  const tr = engine.listTransitions({ symbol: "MSM" });
  assert.ok(tr.length >= 1);
  assert.ok(tr.every((x) => x.calcVersion === MONITOR_MOMENTUM_STATE_VERSION));
  assert.ok(tr.every((x) => Array.isArray(x.evidence)));
});

test("out-of-order (past) sample does not use future path / is ignored", () => {
  const engine = new MomentumStateMachineEngine();
  engine.update(input({ asOfMs: T0 + 5_000, momentumIntensity: 10 }));
  const r = engine.update(input({ asOfMs: T0 + 1_000, momentumIntensity: 90 }));
  assert.ok(
    r.snapshot.evidence.some((e) => e.code === "reject_out_of_order")
  );
  assert.equal(r.transition, null);
});

test("plain-language explanation never labels buy/sell opportunity", () => {
  const engine = new MomentumStateMachineEngine();
  for (const from of ALL_STATES) {
    engine.reset();
    // Seed via halt then release where needed is heavy — use stepMachine
    const { snapshot } = drive(from, T0 + 10_000, {
      halted: from === "HALTED",
      sourceDataAgeMs: from === "UNKNOWN" ? 60_000 : 200,
      momentumIntensity: 30,
      momentumIntensitySlope: 0,
    });
    assert.doesNotMatch(
      snapshot.explanation,
      /\b(buy|sell|long|short|opportunity)\b/i
    );
  }
});
