/**
 * Thesis history — revisions and evaluation snapshots keep old thresholds.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildThesisRevision,
  historicalThresholdsUnchanged,
  isMaterialTextChange,
  type ThesisEvaluationHistoryItem,
} from "../src/lib/thesis/history.ts";
import { evaluateThesisHealth } from "../src/lib/thesis/health/evaluate.ts";
import { THESIS_HEALTH_ENGINE_VERSION } from "../src/lib/thesis/health/types.ts";

test("whitespace-only note edits are not material", () => {
  assert.equal(isMaterialTextChange("hello", "hello"), false);
  assert.equal(isMaterialTextChange("hello", " hello "), false);
  assert.equal(isMaterialTextChange("hello", "hello world"), true);
});

test("threshold edit does not rewrite historical evaluation snapshots", () => {
  const context = {
    symbol: "RKLB",
    thesisCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
    observations: [
      {
        metricKey: "revenue",
        value: 31,
        periodStart: new Date("2026-04-01"),
        periodEnd: new Date("2026-06-30"),
        periodLabel: "2026-Q2",
        fiscalYear: 2026,
        fiscalPeriod: "Q2",
        filedAt: new Date("2026-08-01"),
        accession: "a",
        sourceUrl: null,
        fingerprint: "rev-q2",
        unit: "USD",
        confidence: "high",
        sourceType: "sec_companyfacts",
        secConcept: "Revenues",
        evidence: {},
      },
    ],
    events: [],
    capitalRisk: null,
  };

  const first = evaluateThesisHealth({
    context,
    conditions: [
      {
        id: "c1",
        conditionType: "METRIC_ABOVE",
        label: "Revenue >25",
        polarity: "support_if",
        params: { metricKey: "revenue", threshold: 25 },
      },
    ],
  });

  const second = evaluateThesisHealth({
    context: { ...context, evaluatedAt: new Date("2026-11-01T00:00:00.000Z") },
    conditions: [
      {
        id: "c1",
        conditionType: "METRIC_ABOVE",
        label: "Revenue >20",
        polarity: "support_if",
        params: { metricKey: "revenue", threshold: 20 },
      },
    ],
  });

  const history: ThesisEvaluationHistoryItem[] = [
    {
      id: "e1",
      evaluatedAt: first.evaluatedAt,
      healthStatus: first.healthStatus,
      summary: null,
      conditions: first.conditions.map((c) => ({
        conditionId: c.conditionId,
        label: c.label,
        state: c.state,
        mode: c.mode,
        threshold: c.threshold,
        actualValue: c.actualValue,
        explanation: c.explanation,
        paramsSnapshot: c.paramsSnapshot ?? null,
      })),
    },
    {
      id: "e2",
      evaluatedAt: second.evaluatedAt,
      healthStatus: second.healthStatus,
      summary: null,
      conditions: second.conditions.map((c) => ({
        conditionId: c.conditionId,
        label: c.label,
        state: c.state,
        mode: c.mode,
        threshold: c.threshold,
        actualValue: c.actualValue,
        explanation: c.explanation,
        paramsSnapshot: c.paramsSnapshot ?? null,
      })),
    },
  ];

  const thresholds = historicalThresholdsUnchanged({
    evaluations: history,
    conditionId: "c1",
  });
  assert.deepEqual(thresholds, [25, 20]);
  assert.equal(first.conditions[0]?.paramsSnapshot?.threshold, 25);
  assert.equal(second.conditions[0]?.paramsSnapshot?.threshold, 20);
  assert.equal(THESIS_HEALTH_ENGINE_VERSION.length > 0, true);
});

test("condition delete is recorded as a revision kind", () => {
  const rev = buildThesisRevision({
    thesisId: "t1",
    kind: "condition_deleted",
    summary: "Condition removed: Revenue growth",
    payload: { conditionId: "c1", params: { threshold: 25 } },
    now: new Date("2026-08-01T00:00:00.000Z"),
    id: "r1",
  });
  assert.equal(rev.kind, "condition_deleted");
  assert.equal((rev.payload.params as { threshold: number }).threshold, 25);
});

test("reviving an archived thesis must not delete evaluations", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/thesis/service.ts"),
    "utf8"
  );
  assert.doesNotMatch(src, /thesisEvaluation\.deleteMany/);
  assert.match(src, /appendThesisRevision/);
});

test("history route is session-scoped", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/thesis/[id]/history/route.ts"),
    "utf8"
  );
  assert.match(src, /requireTrustTickerAccess/);
  assert.match(src, /listThesisHistoryForUser\(gate\.user\.id/);
});
