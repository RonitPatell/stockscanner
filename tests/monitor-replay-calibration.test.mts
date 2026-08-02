/**
 * Monitor Replay + calibration — no look-ahead, CA as-of, descriptive metrics only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MONITOR_REPLAY_VERSION,
  MemoryReplayStore,
  adjustPriceAsOf,
  appendCompactFrames,
  assertNoLookahead,
  buildReplayFrame,
  createPlayerState,
  createReplaySession,
  factorsKnownAsOf,
  framesAsOf,
  seek,
  setSpeed,
  stepForward,
  tick,
  visibleFrames,
  play,
} from "../src/domain/monitor/replay/index.ts";
import {
  MONITOR_CALIBRATION_VERSION,
  alignFramesForShadow,
  compareShadowPairs,
  computeCalibrationReport,
  meanWithCI,
  proportionWithCI,
} from "../src/domain/monitor/calibration/index.ts";

const T0 = Date.parse("2026-07-27T14:30:00.000Z");

const VERSIONS = {
  marketState: "monitor-market-state-v1.0",
  momentum: "monitor-momentum-v1.0",
  momentumState: "monitor-momentum-state-v1.0",
  attention: "monitor-attention-v1.0",
  configHash: "test-cfg",
};

function frame(
  asOfMs: number,
  over: Partial<Parameters<typeof buildReplayFrame>[0]> = {}
) {
  return buildReplayFrame({
    asOfMs,
    symbol: "ABC",
    versions: VERSIONS,
    market: {
      lastPrice: 2,
      freshnessMs: 100,
      tradesPerSecond: 10,
      dollarVolumeVelocity: 50_000,
      relativeVolume: 2,
      spreadBps: 30,
      sessionSegment: "regular",
    },
    momentum: { intensity: 0.5, state: "BUILDING", direction: "up" },
    attention: { priority: 50, rank: 2, isLeader: false, previousRank: 2 },
    dataQuality: "ok",
    rawRefs: [{ source: "test", eventId: `e-${asOfMs}`, observedAtMs: asOfMs }],
    ...over,
  });
}

test("versions pinned", () => {
  assert.equal(MONITOR_REPLAY_VERSION, "monitor-replay-v1.0");
  assert.equal(MONITOR_CALIBRATION_VERSION, "monitor-calibration-v1.0");
});

test("compact session rejects tick spam via minInterval", () => {
  let session = createReplaySession({
    id: "s1",
    fromMs: T0,
    toMs: T0 + 60_000,
    symbolScope: ["ABC"],
    minIntervalMs: 5_000,
  });
  session = appendCompactFrames(session, [
    frame(T0),
    frame(T0 + 1_000),
    frame(T0 + 2_000),
    frame(T0 + 6_000),
  ]);
  assert.equal(session.frames.length, 2);
  assert.equal(session.frames[0]!.asOfMs, T0);
  assert.equal(session.frames[1]!.asOfMs, T0 + 6_000);
});

test("event-bearing frames can densify within minInterval", () => {
  let session = createReplaySession({
    id: "s2",
    fromMs: T0,
    toMs: T0 + 60_000,
    symbolScope: ["ABC"],
    minIntervalMs: 5_000,
  });
  session = appendCompactFrames(session, [
    frame(T0),
    frame(T0 + 1_000, {
      events: [
        {
          kind: "halt",
          refId: "h1",
          summary: "halt",
          atMs: T0 + 1_000,
        },
      ],
    }),
  ]);
  assert.equal(session.frames.length, 2);
});

test("framesAsOf and player prevent look-ahead", () => {
  const session = createReplaySession({
    id: "s3",
    fromMs: T0,
    toMs: T0 + 100_000,
    symbolScope: ["ABC"],
    frames: [frame(T0), frame(T0 + 30_000), frame(T0 + 60_000)],
  });
  const mid = framesAsOf(session, T0 + 30_000);
  assert.equal(mid.length, 2);
  assertNoLookahead(mid, T0 + 30_000);

  let state = createPlayerState(session);
  state = seek(session, state, T0 + 30_000);
  const visible = visibleFrames(session, state);
  assert.equal(visible.length, 2);
  assert.ok(visible.every((f) => f.asOfMs <= state.cursorMs));

  state = setSpeed(state, 5);
  state = play(state);
  state = tick(session, state, 1_000); // +5s session time
  assert.equal(state.cursorMs, T0 + 30_000 + 5_000);
  assert.equal(visibleFrames(session, state).length, 2);

  state = stepForward(session, state);
  assert.equal(state.cursorMs, T0 + 60_000);
  assert.equal(visibleFrames(session, state).length, 3);
});

test("corporate actions ignore future factors (no look-ahead)", () => {
  const factors = [
    {
      symbol: "ABC",
      effectiveAt: new Date(T0 + 86_400_000).toISOString(),
      splitFactor: 0.1,
    },
  ];
  const known = factorsKnownAsOf(factors, T0);
  assert.equal(known.length, 0);

  const adj = adjustPriceAsOf({
    symbol: "ABC",
    historicalPrice: 10,
    historicalAtMs: T0 - 1_000,
    asOfMs: T0,
    factors,
  });
  assert.equal(adj.price, 10);
  assert.equal(adj.adjusted, false);

  const after = adjustPriceAsOf({
    symbol: "ABC",
    historicalPrice: 10,
    historicalAtMs: T0 - 1_000,
    asOfMs: T0 + 86_400_000,
    factors,
  });
  assert.equal(after.price, 1);
  assert.equal(after.adjusted, true);
});

test("memory store round-trip preserves versions", async () => {
  const store = new MemoryReplayStore();
  const session = createReplaySession({
    id: "persist",
    fromMs: T0,
    toMs: T0 + 10_000,
    symbolScope: ["ABC"],
    frames: [frame(T0)],
  });
  await store.saveSession(session);
  const got = await store.getSession("persist");
  assert.ok(got);
  assert.equal(got!.schemaVersion, MONITOR_REPLAY_VERSION);
  assert.equal(got!.frames[0]!.versions.momentum, "monitor-momentum-v1.0");
});

test("calibration report is descriptive and omits forbidden fields", () => {
  const frames = [];
  for (let i = 0; i < 20; i++) {
    frames.push(
      frame(T0 + i * 10_000, {
        momentum: {
          intensity: 0.2 + i * 0.03,
          state: i < 8 ? "QUIET" : i < 14 ? "BREAKING" : "FADING",
          direction: "up",
        },
        attention: {
          priority: 40,
          rank: i % 5 === 0 ? 1 : 3,
          isLeader: i % 5 === 0,
          previousRank: i % 5 === 0 ? 4 : 1,
        },
        dataQuality: i === 10 ? "stale" : "ok",
        market: {
          lastPrice: i === 12 ? null : 2,
          freshnessMs: 100,
          tradesPerSecond: 5,
          dollarVolumeVelocity: 10_000,
          relativeVolume: 1,
          spreadBps: 40,
          sessionSegment: "regular",
        },
      })
    );
  }
  const session = createReplaySession({
    id: "cal",
    fromMs: T0,
    toMs: T0 + 200_000,
    symbolScope: ["ABC"],
    frames,
  });
  const report = computeCalibrationReport(session);
  assert.ok(report.sampleFrames >= 20);
  assert.ok(report.intensityByState.length > 0);
  assert.ok(report.stateDuration.length > 0);
  assert.ok(report.disclaimer.toLowerCase().includes("descriptive"));

  const keys = collectKeys(report);
  for (const banned of [
    "predictedProfit",
    "expectedReturn",
    "probabilityOfWinning",
    "winProbability",
    "targetPrice",
  ]) {
    assert.equal(keys.has(banned), false, `must not include key ${banned}`);
  }
});

function collectKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (node == null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, out);
    return out;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    out.add(k);
    collectKeys(v, out);
  }
  return out;
}

test("shadow compare does not flip userOutputUnchanged", () => {
  const prod = [
    frame(T0, {
      momentum: { intensity: 0.5, state: "BUILDING", direction: "up" },
      attention: { priority: 50, rank: 1, isLeader: true, previousRank: 2 },
    }),
    frame(T0 + 10_000, {
      momentum: { intensity: 0.8, state: "BREAKING", direction: "up" },
      attention: { priority: 80, rank: 1, isLeader: true, previousRank: 1 },
    }),
  ];
  const cand = prod.map((f) =>
    frame(f.asOfMs, {
      versions: { ...VERSIONS, momentum: "monitor-momentum-candidate-v0.9" },
      momentum: {
        intensity: (f.momentum.intensity ?? 0) + 0.1,
        state: "TRENDING",
        direction: "up",
      },
      attention: {
        priority: 40,
        rank: 2,
        isLeader: false,
        previousRank: 1,
      },
    })
  );
  const pairs = alignFramesForShadow(prod, cand);
  assert.equal(pairs.length, 2);
  const report = compareShadowPairs({
    productionEngine: "monitor-momentum-v1.0",
    candidateEngine: "monitor-momentum-candidate-v0.9",
    pairs,
  });
  assert.equal(report.userOutputUnchanged, true);
  assert.ok(report.stateAgreement.rate < 1);
  assert.ok(report.leaderDisagreement.count >= 1);
});

test("stats CI helpers", () => {
  const m = meanWithCI([1, 2, 3, 4]);
  assert.equal(m.n, 4);
  assert.ok(m.ci95Low < m.mean && m.mean < m.ci95High);
  const p = proportionWithCI(5, 10);
  assert.equal(p.rate, 0.5);
  assert.ok(p.ci95Low < 0.5 && p.ci95High > 0.5);
});
