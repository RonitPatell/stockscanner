/**
 * Thesis Health — deterministic evaluation (PASS/WARN/FAIL/UNKNOWN).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCondition,
  evaluateThesisHealth,
  noEventBreachState,
  summarizeConditionResults,
} from "../src/lib/thesis/health/evaluate.ts";
import { thesisMetricToFinancialKey } from "../src/lib/thesis/health/metrics-map.ts";
import { capitalRiskExceedsMax } from "../src/lib/thesis/health/capital-rank.ts";
import { buildCapitalRiskFromInstruments } from "../src/lib/capital-risk/snapshot.ts";
import type {
  ThesisHealthConditionInput,
  ThesisHealthContext,
  ThesisHealthMetricObservation,
} from "../src/lib/thesis/health/types.ts";
import { FIXTURE_TECH_COMPANYFACTS } from "./fixtures/companyfacts.ts";
import { normalizeCompanyfactsMetrics } from "../src/lib/metrics/pipeline.ts";

const NOW = new Date("2024-12-01T00:00:00.000Z");
const THESIS_START = new Date("2024-01-01T00:00:00.000Z");

function cond(
  partial: Partial<ThesisHealthConditionInput> &
    Pick<ThesisHealthConditionInput, "conditionType" | "params">
): ThesisHealthConditionInput {
  return {
    id: partial.id ?? `c-${partial.conditionType}`,
    label: partial.label ?? partial.conditionType,
    polarity: partial.polarity ?? "support_if",
    ...partial,
  };
}

function obsFromFixture(): ThesisHealthMetricObservation[] {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  return rows.map((r) => ({
    metricKey: r.metricKey,
    value: r.value,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    periodLabel: r.periodLabel,
    fiscalYear: r.fiscalYear,
    fiscalPeriod: r.fiscalPeriod,
    filedAt: r.filedAt,
    accession: r.accession,
    sourceUrl: r.sourceUrl,
    fingerprint: r.fingerprint,
    unit: r.unit,
    confidence: r.confidence,
    sourceType: r.sourceType,
    secConcept: r.secConcept,
    evidence: r.evidence,
  }));
}

function ctx(
  partial?: Partial<ThesisHealthContext>
): ThesisHealthContext {
  return {
    symbol: "AAPL",
    thesisCreatedAt: THESIS_START,
    evaluatedAt: NOW,
    observations: obsFromFixture(),
    events: [],
    capitalRisk: null,
    ...partial,
  };
}

test("revenue YoY growth > 25% → PASS when actual ~27.3%", () => {
  // Fixture: Q3 2024 28000 vs Q3 2023 22000 = 27.27%
  const result = evaluateCondition(
    cond({
      conditionType: "METRIC_GROWTH_ABOVE",
      label: "Revenue YoY growth > 25%",
      params: {
        metricKey: "revenue",
        thresholdPercent: 25,
        period: "yoy",
      },
    }),
    ctx()
  );
  assert.equal(result.mode, "automated");
  assert.equal(result.state, "PASS");
  assert.ok(result.actualValue != null);
  assert.ok(Math.abs(result.actualValue! - (6000 / 22000) * 100) < 0.1);
  assert.equal(result.threshold, 25);
  assert.ok(result.evidence.sourceType === "metric_observation");
  assert.ok(result.evidence.metricFingerprint);
  assert.ok(result.explanation.includes("growth"));
});

test("share count growth < 10% → FAIL when actual above threshold", () => {
  const observations: ThesisHealthMetricObservation[] = [
    {
      metricKey: "shares_outstanding",
      value: 1142,
      periodStart: null,
      periodEnd: new Date("2024-06-30T00:00:00.000Z"),
      periodLabel: "FY2024 Q3",
      fiscalYear: 2024,
      fiscalPeriod: "Q3",
      filedAt: new Date("2024-08-01T00:00:00.000Z"),
      accession: "a-cur",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/a.htm",
      fingerprint: "sh-cur",
      unit: "shares",
      confidence: "high",
      sourceType: "sec_companyfacts",
      secConcept: "EntityCommonStockSharesOutstanding",
      evidence: {},
    },
    {
      metricKey: "shares_outstanding",
      value: 1000,
      periodStart: null,
      periodEnd: new Date("2023-06-30T00:00:00.000Z"),
      periodLabel: "FY2023 Q3",
      fiscalYear: 2023,
      fiscalPeriod: "Q3",
      filedAt: new Date("2023-08-01T00:00:00.000Z"),
      accession: "a-prior",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/b.htm",
      fingerprint: "sh-prior",
      unit: "shares",
      confidence: "high",
      sourceType: "sec_companyfacts",
      secConcept: "EntityCommonStockSharesOutstanding",
      evidence: {},
    },
  ];

  const result = evaluateCondition(
    cond({
      conditionType: "SHARE_COUNT_CHANGE_BELOW",
      label: "Share count growth < 10%",
      params: { thresholdPercent: 10, period: "yoy" },
    }),
    ctx({ observations })
  );
  assert.equal(result.state, "FAIL");
  assert.ok(result.actualValue != null);
  assert.ok(Math.abs(result.actualValue! - 14.2) < 0.01);
  assert.equal(result.threshold, 10);
  assert.equal(result.evidence.sourceType, "metric_observation");
  assert.ok(result.evidence.sourceUrl);
});

test("No new S-3: capital registration → WARN for support_if, FAIL for invalidate_if", () => {
  assert.equal(noEventBreachState("sec_s3", "support_if"), "WARN");
  assert.equal(noEventBreachState("sec_s3", "invalidate_if"), "FAIL");
  assert.equal(noEventBreachState("sec_s3", "risk_if"), "FAIL");
  assert.equal(noEventBreachState("atm_program", "support_if"), "FAIL");

  const events = [
    {
      id: "ev1",
      eventType: "sec_s3",
      title: "S-3 registration statement",
      occurredAt: new Date("2024-06-15T00:00:00.000Z"),
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/s3.htm",
      sourceId: "0001-24-s3",
      severity: "material",
      category: "capital",
    },
  ];

  const warn = evaluateCondition(
    cond({
      conditionType: "NO_EVENT_TYPE",
      polarity: "support_if",
      params: { eventType: "sec_s3" },
    }),
    ctx({ events })
  );
  assert.equal(warn.state, "WARN");
  assert.equal(warn.evidence.companyEventId, "ev1");
  assert.ok(warn.observationDate);

  const fail = evaluateCondition(
    cond({
      conditionType: "NO_EVENT_TYPE",
      polarity: "invalidate_if",
      params: { eventType: "sec_s3" },
    }),
    ctx({ events })
  );
  assert.equal(fail.state, "FAIL");
});

test("NO_EVENT_TYPE ignores events before thesis start", () => {
  const events = [
    {
      id: "old",
      eventType: "sec_s3",
      title: "Old S-3",
      occurredAt: new Date("2023-06-01T00:00:00.000Z"),
      sourceUrl: null,
      sourceId: null,
      severity: "notable",
      category: "capital",
    },
  ];
  const result = evaluateCondition(
    cond({
      conditionType: "NO_EVENT_TYPE",
      params: { eventType: "sec_s3" },
    }),
    ctx({ events })
  );
  assert.equal(result.state, "PASS");
  assert.equal(result.evidence.sourceType, "engine");
});

test("METRIC_ABOVE / BELOW with missing observation → UNKNOWN + evidence", () => {
  const result = evaluateCondition(
    cond({
      conditionType: "METRIC_ABOVE",
      params: { metricKey: "gross_margin", threshold: 30 },
    }),
    ctx({ observations: [] })
  );
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.actualValue, null);
  assert.ok(result.evidence);
  assert.notEqual(result.actualValue, 0);
});

test("unsupported metric net_margin → UNKNOWN", () => {
  assert.equal(thesisMetricToFinancialKey("net_margin"), null);
  const result = evaluateCondition(
    cond({
      conditionType: "METRIC_ABOVE",
      params: { metricKey: "net_margin", threshold: 10 },
    }),
    ctx()
  );
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.evidence.sourceType, "engine");
});

test("CASH_RUNWAY_ABOVE always UNKNOWN (no burn model)", () => {
  const result = evaluateCondition(
    cond({
      conditionType: "CASH_RUNWAY_ABOVE",
      params: { quarters: 4 },
    }),
    ctx()
  );
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.threshold, 4);
});

test("CUSTOM_MANUAL is never auto-evaluated", () => {
  const result = evaluateCondition(
    cond({
      conditionType: "CUSTOM_MANUAL",
      params: { text: "Management stays focused on enterprise" },
    }),
    ctx()
  );
  assert.equal(result.mode, "manual");
  assert.equal(result.state, null);
});

test("CAPITAL_RISK_NOT_ABOVE: elevated vs max moderate → FAIL", () => {
  assert.equal(capitalRiskExceedsMax("elevated", "moderate"), true);
  assert.equal(capitalRiskExceedsMax("moderate", "moderate"), false);

  const result = evaluateCondition(
    cond({
      conditionType: "CAPITAL_RISK_NOT_ABOVE",
      params: { maxStatus: "moderate" },
    }),
    ctx({
      capitalRisk: {
        id: "cr1",
        status: "elevated",
        asOf: NOW,
        summary: "Active ATM",
        fingerprint: "fp1",
      },
    })
  );
  assert.equal(result.state, "FAIL");
  assert.equal(result.evidence.sourceType, "capital_risk_snapshot");
  assert.equal(result.evidence.capitalRiskSnapshotId, "cr1");
});

test("capital risk snapshot builder ranks ATM as elevated", () => {
  const build = buildCapitalRiskFromInstruments({
    symbol: "TEST",
    instruments: [
      {
        id: "i1",
        instrumentType: "ATM_PROGRAM",
        status: "active",
        potentialDilutionPct: 12,
        estimateLabel: "capacity_only",
        formType: "424B5",
        cik: "1",
      },
    ],
  });
  assert.equal(build.status, "elevated");
  assert.ok(build.summary.includes("not a confirmed sale"));
});

test("health summary counts — no composite stock score", () => {
  const evaluation = evaluateThesisHealth({
    conditions: [
      cond({
        id: "1",
        conditionType: "METRIC_GROWTH_ABOVE",
        params: {
          metricKey: "revenue",
          thresholdPercent: 25,
          period: "yoy",
        },
      }),
      cond({
        id: "2",
        conditionType: "SHARE_COUNT_CHANGE_BELOW",
        params: { thresholdPercent: 1, period: "yoy" },
      }),
      cond({
        id: "3",
        conditionType: "CUSTOM_MANUAL",
        params: { text: "Qualitative" },
      }),
      cond({
        id: "4",
        conditionType: "CASH_RUNWAY_ABOVE",
        params: { quarters: 4 },
      }),
    ],
    context: ctx({
      observations: [
        ...obsFromFixture(),
        {
          metricKey: "shares_outstanding",
          value: 1100,
          periodStart: null,
          periodEnd: new Date("2024-06-30T00:00:00.000Z"),
          periodLabel: "FY2024 Q3",
          fiscalYear: 2024,
          fiscalPeriod: "Q3",
          filedAt: new Date("2024-08-01T00:00:00.000Z"),
          accession: "s1",
          sourceUrl: "https://example.com/s",
          fingerprint: "s1",
          unit: "shares",
          confidence: "high",
          sourceType: "sec_companyfacts",
          secConcept: "x",
          evidence: {},
        },
        {
          metricKey: "shares_outstanding",
          value: 1000,
          periodStart: null,
          periodEnd: new Date("2023-06-30T00:00:00.000Z"),
          periodLabel: "FY2023 Q3",
          fiscalYear: 2023,
          fiscalPeriod: "Q3",
          filedAt: new Date("2023-08-01T00:00:00.000Z"),
          accession: "s0",
          sourceUrl: "https://example.com/s0",
          fingerprint: "s0",
          unit: "shares",
          confidence: "high",
          sourceType: "sec_companyfacts",
          secConcept: "x",
          evidence: {},
        },
      ],
    }),
  });

  assert.equal(evaluation.score, null);
  assert.ok(evaluation.summary.passing >= 1);
  assert.ok(evaluation.summary.failed >= 1);
  assert.ok(evaluation.summary.unknown >= 1);
  assert.equal(evaluation.summary.manual, 1);
  assert.equal(evaluation.healthStatus, "broken");

  for (const c of evaluation.conditions) {
    assert.ok(c.evidence);
    assert.ok(c.evidence.label);
    assert.ok(c.evaluatedAt);
  }
});

test("every automated evaluation includes evidence reference", () => {
  const types = [
    cond({
      conditionType: "METRIC_BELOW",
      params: { metricKey: "cash", threshold: 1e15 },
    }),
    cond({
      conditionType: "EVENT_TYPE_OCCURRED",
      params: { eventType: "atm_program" },
    }),
    cond({
      conditionType: "CAPITAL_RISK_NOT_ABOVE",
      params: { maxStatus: "low" },
    }),
  ] as const;

  for (const c of types) {
    const r = evaluateCondition(c, ctx());
    assert.ok(r.evidence, c.conditionType);
    assert.ok(r.evidence.label.length > 0, c.conditionType);
    assert.ok(r.evaluatedAt);
  }
});

test("summarizeConditionResults: warnings without fails → watch", () => {
  const { healthStatus, summary } = summarizeConditionResults([
    {
      conditionId: "1",
      conditionType: "NO_EVENT_TYPE",
      label: "No S-3",
      polarity: "support_if",
      state: "WARN",
      mode: "automated",
      explanation: "S-3 detected",
      observationDate: NOW.toISOString(),
      actualValue: null,
      threshold: null,
      evidence: { sourceType: "company_event", label: "S-3", companyEventId: "e" },
      evaluatedAt: NOW.toISOString(),
    },
    {
      conditionId: "2",
      conditionType: "METRIC_ABOVE",
      label: "GM",
      polarity: "support_if",
      state: "PASS",
      mode: "automated",
      explanation: "ok",
      observationDate: null,
      actualValue: 40,
      threshold: 30,
      evidence: { sourceType: "metric_observation", label: "gm" },
      evaluatedAt: NOW.toISOString(),
    },
  ]);
  assert.equal(summary.warning, 1);
  assert.equal(summary.passing, 1);
  assert.equal(healthStatus, "watch");
});

test("zero prior growth percent stays UNKNOWN (not zero)", () => {
  const observations: ThesisHealthMetricObservation[] = [
    {
      metricKey: "revenue",
      value: 5000,
      periodStart: new Date("2024-01-01T00:00:00.000Z"),
      periodEnd: new Date("2024-03-31T00:00:00.000Z"),
      periodLabel: "FY2024 Q2",
      fiscalYear: 2024,
      fiscalPeriod: "Q2",
      filedAt: new Date("2024-05-01T00:00:00.000Z"),
      accession: "a",
      sourceUrl: "https://example.com/a",
      fingerprint: "r1",
      unit: "USD",
      confidence: "high",
      sourceType: "sec_companyfacts",
      secConcept: "Revenues",
      evidence: {},
    },
    {
      metricKey: "revenue",
      value: 0,
      periodStart: new Date("2023-01-01T00:00:00.000Z"),
      periodEnd: new Date("2023-03-31T00:00:00.000Z"),
      periodLabel: "FY2023 Q2",
      fiscalYear: 2023,
      fiscalPeriod: "Q2",
      filedAt: new Date("2023-05-01T00:00:00.000Z"),
      accession: "b",
      sourceUrl: "https://example.com/b",
      fingerprint: "r0",
      unit: "USD",
      confidence: "high",
      sourceType: "sec_companyfacts",
      secConcept: "Revenues",
      evidence: {},
    },
  ];
  const result = evaluateCondition(
    cond({
      conditionType: "METRIC_GROWTH_ABOVE",
      params: {
        metricKey: "revenue",
        thresholdPercent: 25,
        period: "yoy",
      },
    }),
    ctx({ observations })
  );
  assert.equal(result.state, "UNKNOWN");
  assert.equal(result.actualValue, null);
});
