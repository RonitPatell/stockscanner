/**
 * Momentum Field — layout, a11y names, pulse caps, batch constants.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  FIELD_FRAME_MS,
  FIELD_LERP_MS,
  FIELD_MAX_NODES,
  FIELD_NODE_R_MIN,
  type MomentumFieldNode,
} from "../src/components/monitor/field/field-types.ts";
import { layoutMomentumField } from "../src/components/monitor/field/field-layout.ts";
import {
  fieldNodeAccessibleName,
  fieldNodeOpacity,
  pulsePeriodSec,
  selectPulseSymbol,
} from "../src/components/monitor/field/field-a11y.ts";

function node(
  over: Partial<MomentumFieldNode> & Pick<MomentumFieldNode, "symbol" | "rank">
): MomentumFieldNode {
  return {
    attentionPriority: 50,
    momentumState: "BUILDING",
    direction: "up",
    accelerationNorm: 0.4,
    risk: "low",
    verifiedCatalyst: false,
    sourceUrl: null,
    dataFreshnessMs: 1500,
    dataQualityWarning: false,
    halted: false,
    onWatchlist: false,
    muted: false,
    pinned: false,
    isLeader: false,
    previousRank: null,
    ...over,
  };
}

test("caps field at 12 nodes", () => {
  const nodes = Array.from({ length: 20 }, (_, i) =>
    node({
      symbol: `S${i}`,
      rank: i + 1,
      attentionPriority: 90 - i,
      isLeader: i === 0,
    })
  );
  const layout = layoutMomentumField(nodes);
  assert.ok(layout.points.length <= FIELD_MAX_NODES);
  assert.equal(FIELD_MAX_NODES, 12);
});

test("leader at centre; halted in halt ring", () => {
  const nodes = [
    node({
      symbol: "LEAD",
      rank: 1,
      isLeader: true,
      momentumState: "BREAKING",
      attentionPriority: 90,
    }),
    node({
      symbol: "HLT",
      rank: 2,
      halted: true,
      momentumState: "HALTED",
      attentionPriority: 85,
      risk: "critical",
    }),
    node({
      symbol: "BLD",
      rank: 3,
      momentumState: "BUILDING",
      attentionPriority: 60,
    }),
    node({
      symbol: "EMG",
      rank: 4,
      momentumState: "EMERGING",
      attentionPriority: 30,
    }),
  ];
  const layout = layoutMomentumField(nodes);
  const lead = layout.points.find((p) => p.symbol === "LEAD");
  const hlt = layout.points.find((p) => p.symbol === "HLT");
  const bld = layout.points.find((p) => p.symbol === "BLD");
  const emg = layout.points.find((p) => p.symbol === "EMG");
  assert.equal(lead?.ring, "centre");
  assert.equal(hlt?.ring, "halt");
  assert.equal(bld?.ring, "middle");
  assert.equal(emg?.ring, "outer");
  assert.ok(layout.haltSymbols.includes("HLT"));
  assert.equal(layout.leaderSymbol, "LEAD");
});

test("BREAKING / high ACTIVE → inner ring", () => {
  const layout = layoutMomentumField([
    node({
      symbol: "L",
      rank: 1,
      isLeader: true,
      momentumState: "ACTIVE",
      attentionPriority: 80,
    }),
    node({
      symbol: "BRK",
      rank: 2,
      momentumState: "BREAKING",
      attentionPriority: 70,
    }),
    node({
      symbol: "ACT",
      rank: 3,
      momentumState: "ACTIVE",
      attentionPriority: 68,
    }),
  ]);
  assert.equal(layout.points.find((p) => p.symbol === "BRK")?.ring, "inner");
  assert.equal(layout.points.find((p) => p.symbol === "ACT")?.ring, "inner");
});

test("accessible name includes ticker rank state direction risk freshness", () => {
  const name = fieldNodeAccessibleName(
    node({
      symbol: "TEST",
      rank: 3,
      momentumState: "COOLING",
      direction: "down",
      risk: "high",
      dataFreshnessMs: 12_000,
      dataQualityWarning: true,
      verifiedCatalyst: true,
      previousRank: 5,
    })
  );
  assert.match(name, /TEST/);
  assert.match(name, /rank 3/);
  assert.match(name, /COOLING/i);
  assert.match(name, /downward/);
  assert.match(name, /high risk/);
  assert.match(name, /freshness 12 seconds/);
  assert.match(name, /data quality warning/);
  assert.match(name, /verified catalyst/);
  assert.match(name, /rank up 2/);
});

test("pulse one-shot helpers — reduced motion / low accel / single winner", () => {
  assert.equal(
    pulsePeriodSec(0.9, { reducedMotion: true, visible: true }),
    null
  );
  assert.equal(
    pulsePeriodSec(0.9, { reducedMotion: false, visible: false }),
    null
  );
  const p = pulsePeriodSec(1, { reducedMotion: false, visible: true });
  assert.ok(p != null && p >= 0.7 && p <= 1.2);
  assert.equal(pulsePeriodSec(0.2, { reducedMotion: false, visible: true }), null);

  const winner = selectPulseSymbol(
    [
      node({ symbol: "A", rank: 1, accelerationNorm: 0.9 }),
      node({ symbol: "B", rank: 2, accelerationNorm: 0.8 }),
      node({ symbol: "H", rank: 3, accelerationNorm: 1, halted: true }),
    ],
    { reducedMotion: false, visible: true }
  );
  assert.equal(winner, "A");
  assert.equal(
    selectPulseSymbol(
      [node({ symbol: "A", rank: 1, accelerationNorm: 0.2 })],
      { reducedMotion: false, visible: true }
    ),
    null
  );
});

test("node radius floor keeps low-priority names legible", () => {
  const layout = layoutMomentumField([
    node({
      symbol: "LEAD",
      rank: 1,
      isLeader: true,
      attentionPriority: 95,
      momentumState: "BREAKING",
    }),
    node({
      symbol: "LOW",
      rank: 8,
      attentionPriority: 5,
      momentumState: "FADING",
    }),
  ]);
  const low = layout.points.find((p) => p.symbol === "LOW");
  const lead = layout.points.find((p) => p.symbol === "LEAD");
  assert.ok(low && low.r >= FIELD_NODE_R_MIN);
  assert.ok(lead && lead.r > low.r);
  assert.ok(lead.r <= FIELD_NODE_R_MIN + 20);
});

test("stale / muted nodes dim via opacity helper", () => {
  assert.equal(fieldNodeOpacity(node({ symbol: "A", rank: 1 })), 1);
  assert.ok(
    fieldNodeOpacity(
      node({ symbol: "B", rank: 2, dataQualityWarning: true })
    ) < 0.7
  );
  assert.ok(
    fieldNodeOpacity(node({ symbol: "C", rank: 3, muted: true })) < 0.5
  );
});

test("visual batch cadence and leader lerp band", () => {
  assert.ok(FIELD_FRAME_MS >= 50);
  assert.ok(FIELD_FRAME_MS <= 200);
  assert.ok(FIELD_LERP_MS >= 350 && FIELD_LERP_MS <= 500);
});

test("stable layout: same inputs → same positions", () => {
  const nodes = [
    node({ symbol: "A", rank: 1, isLeader: true, momentumState: "BREAKING" }),
    node({ symbol: "B", rank: 2, momentumState: "BUILDING" }),
    node({ symbol: "C", rank: 3, momentumState: "EMERGING" }),
  ];
  const a = layoutMomentumField(nodes);
  const b = layoutMomentumField(nodes);
  assert.deepEqual(a.points, b.points);
});
