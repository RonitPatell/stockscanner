/**
 * Attention Priority Engine — inspection order only (never trade entry).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AttentionPriorityEngine,
  MONITOR_ATTENTION_VERSION,
  scoreAttention,
  mergeLeaderConfig,
} from "../src/domain/monitor/attention/index.ts";
import type { AttentionCandidateInput } from "../src/domain/monitor/attention/index.ts";

const T0 = Date.parse("2026-07-27T15:00:00.000Z");

function cand(
  symbol: string,
  over: Partial<AttentionCandidateInput> = {}
): AttentionCandidateInput {
  return {
    symbol,
    momentumIntensity: 40,
    momentumConfidence: "HIGH",
    catalystMateriality: null,
    catalystAgeMs: null,
    catalystVerified: false,
    haltUrgency: null,
    haltLifecycle: "none",
    dilutionUrgency: null,
    regulatoryUrgency: null,
    onWatchlist: false,
    alertStrategyMatch: false,
    reactionStage: "developing",
    dataConfidence: "HIGH",
    sourceDataAgeMs: 200,
    session: "regular",
    ...over,
  };
}

test("version pinned", () => {
  assert.equal(MONITOR_ATTENTION_VERSION, "monitor-attention-v1.0");
});

test("score exposes tier, ordered reasons, no trade language", () => {
  const cfg = mergeLeaderConfig();
  const s = scoreAttention({
    candidate: cand("AAA", {
      momentumIntensity: 80,
      catalystMateriality: 70,
      catalystVerified: true,
      catalystAgeMs: 60_000,
    }),
    variant: "global",
    leaderConfig: cfg,
    nowMs: T0,
  });
  assert.ok(s.attentionPriority >= 0 && s.attentionPriority <= 100);
  assert.ok(["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(s.priorityTier));
  assert.equal(s.calcVersion, MONITOR_ATTENTION_VERSION);
  // Reasons ordered by |contribution|
  for (let i = 1; i < s.reasons.length; i++) {
    assert.ok(
      Math.abs(s.reasons[i - 1]!.contribution) >=
        Math.abs(s.reasons[i]!.contribution) - 0.05
    );
  }
  const blob = JSON.stringify(s);
  assert.doesNotMatch(blob, /buy|sell|enter trade|recommend/i);
});

test("rapid score oscillation does not flap leader", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({
    now: () => now,
    leader: {
      challengeMargin: 5,
      challengeHoldMs: 3_000,
      minLeaderHoldMs: 5_000,
    },
  });

  let r = engine.evaluate({
    candidates: [cand("A", { momentumIntensity: 70 }), cand("B", { momentumIntensity: 50 })],
    variant: "global",
    nowMs: now,
  });
  assert.equal(r.leader.symbol, "A");

  // Flip rapidly every 200ms — B never holds margin duration.
  for (let i = 0; i < 20; i++) {
    now += 200;
    const highB = i % 2 === 0;
    r = engine.evaluate({
      candidates: [
        cand("A", { momentumIntensity: highB ? 50 : 72 }),
        cand("B", { momentumIntensity: highB ? 75 : 48 }),
      ],
      variant: "global",
      nowMs: now,
    });
  }
  assert.equal(r.leader.symbol, "A", "leader should not flap under rapid oscillation");
  assert.ok(engine.listTransitions({ variant: "global" }).length <= 1);
});

test("two nearly equal candidates — margin blocks switch", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({
    now: () => now,
    leader: {
      challengeMargin: 5,
      challengeHoldMs: 1_000,
      minLeaderHoldMs: 1_000,
    },
  });

  engine.evaluate({
    candidates: [cand("A", { momentumIntensity: 60 }), cand("B", { momentumIntensity: 58 })],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "A");
  const leadScore = engine.getLeader("global").score ?? 0;

  now += 2_000;
  // Near-tie: B slightly ahead on raw momentum but final priority within margin.
  engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 60 }),
      cand("B", { momentumIntensity: 62 }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "A");

  now += 2_000;
  // Clear margin over current leader score.
  engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 60 }),
      cand("B", { momentumIntensity: 95 }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "A");
  assert.equal(engine.getLeader("global").challengerSymbol, "B");
  assert.ok((engine.getLeader("global").challengerScore ?? 0) >= leadScore + 5);

  now += 1_500;
  engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 60 }),
      cand("B", { momentumIntensity: 95 }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "B");
  const t = engine.listTransitions({ variant: "global" }).at(-1);
  assert.equal(t?.reason, "challenge_margin_held");
  assert.equal(t?.previousSymbol, "A");
  assert.equal(t?.newSymbol, "B");
  assert.ok(t?.calcVersion === MONITOR_ATTENTION_VERSION);
  assert.ok(t?.timestamp);
});

test("new critical catalyst bypasses leader delay", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({
    now: () => now,
    leader: { minLeaderHoldMs: 60_000, challengeHoldMs: 60_000 },
  });

  engine.evaluate({
    candidates: [cand("LEAD", { momentumIntensity: 55 }), cand("IDLE", { momentumIntensity: 20 })],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "LEAD");

  now += 500; // well inside hold
  const r = engine.evaluate({
    candidates: [
      cand("LEAD", { momentumIntensity: 55 }),
      cand("CAT", {
        momentumIntensity: 30,
        catalystMateriality: 95,
        catalystVerified: true,
        catalystAgeMs: 30_000,
        reactionStage: "initial",
      }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(r.leader.symbol, "CAT");
  assert.equal(r.transition?.reason, "critical_bypass");
  assert.equal(r.transition?.bypass, true);
  assert.ok(r.top10[0]?.score.priorityTier === "HIGH" || r.top10[0]?.score.priorityTier === "CRITICAL" || r.leader.symbol === "CAT");
});

test("user-pinned ticker disables automatic selection", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({ now: () => now });

  engine.evaluate({
    candidates: [cand("A", { momentumIntensity: 80 }), cand("B", { momentumIntensity: 20 })],
    variant: "user",
    userScopeId: "u1",
    nowMs: now,
  });
  assert.equal(engine.getLeader("user", "u1").symbol, "A");

  const pinT = engine.pin("B", { variant: "user", userScopeId: "u1" });
  assert.equal(pinT?.reason, "user_pin");
  assert.equal(pinT?.pinned, true);

  now += 10_000;
  engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 95, catalystMateriality: 99, catalystVerified: true, catalystAgeMs: 1000 }),
      cand("B", { momentumIntensity: 10 }),
    ],
    variant: "user",
    userScopeId: "u1",
    nowMs: now,
  });
  assert.equal(engine.getLeader("user", "u1").symbol, "B");
  assert.equal(engine.getLeader("user", "u1").pinned, true);

  engine.unpin({ variant: "user", userScopeId: "u1" });
  now += 10_000;
  const after = engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 90 }),
      cand("B", { momentumIntensity: 10 }),
    ],
    variant: "user",
    userScopeId: "u1",
    nowMs: now,
  });
  assert.equal(after.leader.symbol, "A");
});

test("stale leader / stale challenger cannot become silent leader", () => {
  const cfg = mergeLeaderConfig({ staleLeaderMs: 15_000, staleScoreMs: 5_000 });
  const stale = scoreAttention({
    candidate: cand("STALE", {
      momentumIntensity: 90,
      sourceDataAgeMs: 60_000,
      dataConfidence: "HIGH",
    }),
    variant: "global",
    leaderConfig: cfg,
    nowMs: T0,
  });
  assert.equal(stale.eligibleForLeader, false);
  assert.ok(stale.warnings.length > 0);

  let now = T0;
  const engine = new AttentionPriorityEngine({
    now: () => now,
    leader: { staleLeaderMs: 15_000, minLeaderHoldMs: 0, challengeHoldMs: 0, challengeMargin: 1 },
  });

  // Fresh leader first
  engine.evaluate({
    candidates: [cand("FRESH", { momentumIntensity: 50, sourceDataAgeMs: 100 })],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "FRESH");

  now += 100;
  // Stale higher score — must not become leader silently
  const r = engine.evaluate({
    candidates: [
      cand("FRESH", { momentumIntensity: 50, sourceDataAgeMs: 100 }),
      cand("STALE", { momentumIntensity: 99, sourceDataAgeMs: 60_000 }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(r.leader.symbol, "FRESH");
  assert.ok(
    r.scores.find((s) => s.symbol === "STALE")?.eligibleForLeader === false
  );
});

test("watchlist personalization: user leader differs from global", () => {
  const engine = new AttentionPriorityEngine({
    now: () => T0,
    leader: { minLeaderHoldMs: 0, challengeHoldMs: 0, challengeMargin: 1 },
  });

  const candidates = [
    cand("POP", { momentumIntensity: 70, onWatchlist: false }),
    cand("MINE", { momentumIntensity: 45, onWatchlist: true, alertStrategyMatch: true }),
  ];

  const both = engine.evaluateBoth({
    candidates,
    userScopeId: "trader-1",
    nowMs: T0,
  });

  assert.equal(both.global.leader.symbol, "POP");
  assert.equal(both.user.leader.symbol, "MINE");
  assert.ok(
    (both.user.scores.find((s) => s.symbol === "MINE")?.attentionPriority ?? 0) >
      (both.global.scores.find((s) => s.symbol === "MINE")?.attentionPriority ?? 0)
  );
  assert.equal(both.user.top10.length <= 10, true);
});

test("halt and resumption urgency bypass", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({
    now: () => now,
    leader: { minLeaderHoldMs: 30_000, challengeHoldMs: 30_000 },
  });

  engine.evaluate({
    candidates: [cand("A", { momentumIntensity: 60 }), cand("B", { momentumIntensity: 40 })],
    variant: "global",
    nowMs: now,
  });
  assert.equal(engine.getLeader("global").symbol, "A");

  now += 200;
  let r = engine.evaluate({
    candidates: [
      cand("A", { momentumIntensity: 60 }),
      cand("HLT", {
        momentumIntensity: 20,
        haltUrgency: 90,
        haltLifecycle: "halted",
      }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(r.leader.symbol, "HLT");
  assert.equal(r.transition?.reason, "critical_bypass");
  assert.ok(
    r.scores
      .find((s) => s.symbol === "HLT")
      ?.reasons.some((x) => x.code === "halt_urgency")
  );

  now += 200;
  r = engine.evaluate({
    candidates: [
      cand("HLT", {
        momentumIntensity: 10,
        haltUrgency: 30,
        haltLifecycle: "halted",
      }),
      cand("RES", {
        momentumIntensity: 40,
        haltUrgency: 95,
        haltLifecycle: "resumption_quote_scheduled",
      }),
    ],
    variant: "global",
    nowMs: now,
  });
  assert.equal(r.leader.symbol, "RES");
  assert.equal(r.transition?.bypass, true);
  assert.ok(
    r.scores
      .find((s) => s.symbol === "RES")
      ?.reasons.some((x) => x.code === "resumption_urgency")
  );
});

test("top 10 + rank-change history recorded", () => {
  let now = T0;
  const engine = new AttentionPriorityEngine({ now: () => now, topN: 10 });

  const many = Array.from({ length: 15 }, (_, i) =>
    cand(`S${i}`, { momentumIntensity: 90 - i })
  );
  let r = engine.evaluate({ candidates: many, variant: "global", nowMs: now });
  assert.equal(r.top10.length, 10);
  assert.equal(r.top10[0]!.rank, 1);
  assert.equal(r.rankSnapshot.calcVersion, MONITOR_ATTENTION_VERSION);

  now += 1_000;
  // Shuffle intensities so S5 rises
  const many2 = Array.from({ length: 15 }, (_, i) =>
    cand(`S${i}`, { momentumIntensity: i === 5 ? 99 : 80 - i })
  );
  r = engine.evaluate({ candidates: many2, variant: "global", nowMs: now });
  const s5 = r.top10.find((t) => t.score.symbol === "S5");
  assert.ok(s5);
  assert.equal(s5!.rank, 1);
  assert.ok(s5!.rankDelta != null && s5!.rankDelta < 0);
  const hist = engine.rankHistoryFor("S5", "global");
  assert.ok(hist.length >= 2);
});

test("explanation contract: attention is inspection priority only", () => {
  const engine = new AttentionPriorityEngine({ now: () => T0 });
  const r = engine.evaluate({
    candidates: [cand("X", { momentumIntensity: 50 })],
    variant: "global",
  });
  for (const s of r.scores) {
    for (const reason of s.reasons) {
      assert.doesNotMatch(reason.detail, /\b(buy|sell|long|short)\b/i);
    }
  }
});
