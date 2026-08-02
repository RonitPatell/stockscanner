/**
 * Priority Ladder — filters, explain rank, controlled reorder.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildRankExplain } from "../src/components/monitor/ladder/ladder-explain.ts";
import { filterLadderRows } from "../src/components/monitor/ladder/ladder-filter.ts";
import {
  createOrderState,
  projectLadderDisplay,
} from "../src/components/monitor/ladder/ladder-order.ts";
import {
  LADDER_REORDER_MS,
  LADDER_TOP_N,
  type PriorityLadderRow,
} from "../src/components/monitor/ladder/ladder-types.ts";

function row(
  over: Partial<PriorityLadderRow> & Pick<PriorityLadderRow, "symbol">
): PriorityLadderRow {
  const explain = buildRankExplain({
    momentumIntensity: over.momentumIntensity ?? 50,
    catalystUrgency: 0,
    haltOrRiskUrgency: 0,
    onWatchlist: over.onWatchlist ?? false,
    strategyMatch: over.strategyMatch ?? false,
    dataConfidenceWarning: over.dataConfidenceWarning ?? false,
    dataFreshnessMs: 1000,
    pinned: false,
    hysteresis: "not_leader",
  });
  return {
    attentionPriority: 50,
    rank: 1,
    previousRank: null,
    momentumIntensity: 50,
    momentumState: "BUILDING",
    direction: "up",
    priorityReason: "Building participation",
    hasCatalyst: false,
    catalystVerified: false,
    risk: "none",
    onWatchlist: false,
    strategyMatch: false,
    dataConfidenceWarning: false,
    dataFreshnessMs: 1000,
    halted: false,
    muted: false,
    pinned: false,
    sourceUrl: null,
    criticalEvent: false,
    explain,
    ...over,
  };
}

test("top N is 10", () => {
  assert.equal(LADDER_TOP_N, 10);
});

test("filters: watchlist strategy direction risk halted", () => {
  const rows = [
    row({ symbol: "A", onWatchlist: true, direction: "up" }),
    row({ symbol: "B", strategyMatch: true, direction: "down" }),
    row({ symbol: "C", risk: "high", direction: "up" }),
    row({
      symbol: "D",
      halted: true,
      criticalEvent: true,
      direction: "neutral",
    }),
  ];
  assert.deepEqual(
    filterLadderRows(rows, "watchlist").map((r) => r.symbol),
    ["A"]
  );
  assert.deepEqual(
    filterLadderRows(rows, "strategy").map((r) => r.symbol),
    ["B"]
  );
  assert.deepEqual(
    filterLadderRows(rows, "upward").map((r) => r.symbol),
    ["A", "C"]
  );
  assert.deepEqual(
    filterLadderRows(rows, "downward").map((r) => r.symbol),
    ["B"]
  );
  assert.ok(filterLadderRows(rows, "risk").some((r) => r.symbol === "C"));
  assert.ok(filterLadderRows(rows, "risk").some((r) => r.symbol === "D"));
  assert.deepEqual(
    filterLadderRows(rows, "halted").map((r) => r.symbol),
    ["D"]
  );
});

test("explain rank includes required contribution lines — no P&L language", () => {
  const ex = buildRankExplain({
    momentumIntensity: 80,
    catalystUrgency: 70,
    haltOrRiskUrgency: 40,
    onWatchlist: true,
    strategyMatch: true,
    dataConfidenceWarning: true,
    dataFreshnessMs: 20_000,
    pinned: false,
    hysteresis: "challenger_pending",
    challengerSymbol: "XYZ",
  });
  const labels = ex.lines.map((l) => l.label);
  assert.ok(labels.includes("Momentum contribution"));
  assert.ok(labels.includes("Catalyst urgency"));
  assert.ok(labels.includes("Halt or risk urgency"));
  assert.ok(labels.includes("Personal relevance"));
  assert.ok(labels.includes("Data-quality adjustment"));
  assert.ok(labels.includes("Leader hysteresis"));
  assert.ok(ex.dataQualityAdjustment < 0);
  assert.match(ex.leaderHysteresisDetail, /XYZ|Challenger/i);
  const blob = JSON.stringify(ex);
  assert.doesNotMatch(blob, /expected return|probability of success|buy|sell/i);
});

test("scores can change without reordering before cadence", () => {
  const t0 = 1_000_000;
  let state = createOrderState();
  const first = [
    row({ symbol: "A", attentionPriority: 90, momentumIntensity: 90 }),
    row({ symbol: "B", attentionPriority: 80, momentumIntensity: 80 }),
  ];
  let proj = projectLadderDisplay(first, state, t0);
  state = proj.state;
  assert.deepEqual(
    proj.rows.map((r) => r.symbol),
    ["A", "B"]
  );

  // Flip scores before cadence — order stays, scores update
  const flipped = [
    row({ symbol: "A", attentionPriority: 40, momentumIntensity: 40 }),
    row({ symbol: "B", attentionPriority: 95, momentumIntensity: 95 }),
  ];
  proj = projectLadderDisplay(flipped, state, t0 + 500);
  state = proj.state;
  assert.equal(proj.reordered, false);
  assert.deepEqual(
    proj.rows.map((r) => r.symbol),
    ["A", "B"]
  );
  assert.equal(proj.rows[0]?.attentionPriority, 40);
  assert.equal(proj.rows[1]?.attentionPriority, 95);

  // After cadence — reorder
  proj = projectLadderDisplay(flipped, state, t0 + LADDER_REORDER_MS + 10);
  assert.equal(proj.reordered, true);
  assert.deepEqual(
    proj.rows.map((r) => r.symbol),
    ["B", "A"]
  );
});

test("critical event forces immediate reorder", () => {
  const t0 = 2_000_000;
  let state = createOrderState();
  const first = [
    row({ symbol: "A", attentionPriority: 90 }),
    row({ symbol: "B", attentionPriority: 50 }),
  ];
  let proj = projectLadderDisplay(first, state, t0);
  state = proj.state;

  const critical = [
    row({ symbol: "A", attentionPriority: 40 }),
    row({
      symbol: "B",
      attentionPriority: 88,
      halted: true,
      criticalEvent: true,
      risk: "critical",
    }),
  ];
  proj = projectLadderDisplay(critical, state, t0 + 100);
  assert.ok(proj.reordered || proj.rows[0]?.symbol === "B");
  assert.equal(proj.rows[0]?.symbol, "B");
  assert.ok(proj.criticalAnnouncements.length >= 1);
});

test("caps display at top 10", () => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    row({
      symbol: `S${i}`,
      attentionPriority: 100 - i,
    })
  );
  const proj = projectLadderDisplay(rows, createOrderState(), Date.now());
  assert.ok(proj.rows.length <= 10);
});

test("does not surface unexplained composite as sole signal", () => {
  const ex = buildRankExplain({
    momentumIntensity: 10,
    catalystUrgency: 0,
    haltOrRiskUrgency: 0,
    onWatchlist: false,
    strategyMatch: false,
    dataConfidenceWarning: false,
    dataFreshnessMs: 500,
    pinned: false,
    hysteresis: "stable_leader",
  });
  assert.ok(ex.lines.length >= 5);
  assert.ok(ex.lines.every((l) => l.label.length > 0 && l.value.length > 0));
});
