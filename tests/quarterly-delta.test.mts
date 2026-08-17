/**
 * Quarterly Delta engine — YoY/bps/amendments/restatements/UNKNOWN safety.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_TECH_COMPANYFACTS } from "./fixtures/companyfacts.ts";
import { normalizeCompanyfactsMetrics } from "../src/lib/metrics/pipeline.ts";
import type {
  FinancialMetricKey,
  MetricConfidence,
  NormalizedMetricObservation,
} from "../src/lib/metrics/types.ts";
import {
  buildQuarterlyDeltaReport,
  dedupeAmendments,
  selectCurrentObservation,
} from "../src/lib/metrics/quarterly-delta.ts";

function obs(
  partial: Partial<NormalizedMetricObservation> & {
    metricKey: FinancialMetricKey;
    value: number | null;
    fingerprint: string;
  }
): NormalizedMetricObservation {
  return {
    symbol: "TEST",
    cik: "0000000001",
    unit: "USD",
    currency: "USD",
    periodStart: null,
    periodEnd: null,
    periodLabel: null,
    fiscalYear: null,
    fiscalPeriod: null,
    filedAt: null,
    accession: null,
    secConcept: null,
    sourceType: "sec_companyfacts",
    sourceId: null,
    sourceUrl: null,
    confidence: "high" as MetricConfidence,
    evidence: {},
    ...partial,
  };
}

test("Quarterly Delta YoY revenue from tech fixture", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const report = buildQuarterlyDeltaReport({
    symbol: "AAPL",
    observations: rows,
    now: new Date("2024-12-01T00:00:00.000Z"),
  });
  const rev = report.rows.find((r) => r.metricKey === "revenue");
  assert.ok(rev);
  assert.equal(rev!.comparable, true);
  assert.equal(rev!.basis, "yoy");
  assert.equal(rev!.current!.value, 28_000);
  assert.equal(rev!.previous!.value, 22_000);
  assert.equal(rev!.absoluteChange, 6_000);
  assert.ok(rev!.percentChange != null);
  assert.ok(Math.abs(rev!.percentChange! - (6000 / 22000) * 100) < 0.01);
  assert.ok(rev!.current!.periodLabel || rev!.current!.fiscalPeriod);
  assert.ok(rev!.current!.filedAt);
});

test("Quarterly Delta margin uses basis points", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const report = buildQuarterlyDeltaReport({ symbol: "AAPL", observations: rows });
  const gm = report.rows.find((r) => r.metricKey === "gross_margin");
  assert.ok(gm);
  assert.equal(gm!.comparable, true);
  assert.ok(gm!.bpsChange != null);
  // 50% vs ~45.45% → positive bps
  assert.ok(gm!.bpsChange! > 0);
  assert.equal(gm!.percentChange != null || gm!.bpsChange != null, true);
});

test("missing values stay unavailable — never zero", () => {
  const report = buildQuarterlyDeltaReport({
    symbol: "EMPTY",
    observations: [],
  });
  assert.equal(report.empty, true);
  for (const row of report.rows) {
    assert.equal(row.emphasis, "unavailable");
    assert.equal(row.absoluteChange, null);
    assert.equal(row.percentChange, null);
    assert.equal(row.bpsChange, null);
    assert.notEqual(row.absoluteChange, 0);
  }
});

test("zero prior denominator: absolute ok, percent UNKNOWN", () => {
  const current = obs({
    metricKey: "revenue",
    value: 5_000,
    fingerprint: "rev-cur",
    fiscalYear: 2024,
    fiscalPeriod: "Q2",
    periodStart: new Date("2024-01-01T00:00:00.000Z"),
    periodEnd: new Date("2024-03-31T00:00:00.000Z"),
    periodLabel: "FY2024 Q2",
    filedAt: new Date("2024-05-01T00:00:00.000Z"),
    accession: "0001-24",
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/a.htm",
  });
  const prior = obs({
    metricKey: "revenue",
    value: 0,
    fingerprint: "rev-prior",
    fiscalYear: 2023,
    fiscalPeriod: "Q2",
    periodStart: new Date("2023-01-01T00:00:00.000Z"),
    periodEnd: new Date("2023-03-31T00:00:00.000Z"),
    periodLabel: "FY2023 Q2",
    filedAt: new Date("2023-05-01T00:00:00.000Z"),
    accession: "0001-23",
  });
  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [current, prior],
  });
  const rev = report.rows.find((r) => r.metricKey === "revenue")!;
  assert.equal(rev.comparable, true);
  assert.equal(rev.absoluteChange, 5_000);
  assert.equal(rev.percentChange, null);
});

test("fiscal-year boundary: Q1 YoY uses prior FY same quarter", () => {
  const q1_2025 = obs({
    metricKey: "revenue",
    value: 12_000,
    fingerprint: "q1-25",
    fiscalYear: 2025,
    fiscalPeriod: "Q1",
    periodStart: new Date("2024-10-01T00:00:00.000Z"),
    periodEnd: new Date("2024-12-28T00:00:00.000Z"),
    periodLabel: "FY2025 Q1",
    filedAt: new Date("2025-02-01T00:00:00.000Z"),
    accession: "a-25",
  });
  const q4_2024 = obs({
    metricKey: "revenue",
    value: 11_000,
    fingerprint: "q4-24",
    fiscalYear: 2024,
    fiscalPeriod: "Q4",
    periodStart: new Date("2024-07-01T00:00:00.000Z"),
    periodEnd: new Date("2024-09-28T00:00:00.000Z"),
    periodLabel: "FY2024 Q4",
    filedAt: new Date("2024-11-01T00:00:00.000Z"),
    accession: "a-24q4",
  });
  const q1_2024 = obs({
    metricKey: "revenue",
    value: 10_000,
    fingerprint: "q1-24",
    fiscalYear: 2024,
    fiscalPeriod: "Q1",
    periodStart: new Date("2023-10-01T00:00:00.000Z"),
    periodEnd: new Date("2023-12-30T00:00:00.000Z"),
    periodLabel: "FY2024 Q1",
    filedAt: new Date("2024-02-01T00:00:00.000Z"),
    accession: "a-24",
  });
  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [q1_2025, q4_2024, q1_2024],
  });
  const rev = report.rows.find((r) => r.metricKey === "revenue")!;
  assert.equal(rev.basis, "yoy");
  assert.equal(rev.previous!.fiscalYear, 2024);
  assert.equal(rev.previous!.fiscalPeriod, "Q1");
  assert.equal(rev.absoluteChange, 2_000);
  // Must not compare to adjacent Q4
  assert.equal(rev.previous!.value, 10_000);
  assert.notEqual(rev.previous!.fiscalPeriod, "Q4");
});

test("duplicate filing amendments keep latest filedAt", () => {
  const original = obs({
    metricKey: "cash",
    value: 1_000,
    fingerprint: "cash-orig",
    fiscalYear: 2024,
    fiscalPeriod: "Q2",
    periodEnd: new Date("2024-03-31T00:00:00.000Z"),
    periodLabel: "FY2024 Q2",
    filedAt: new Date("2024-05-01T00:00:00.000Z"),
    accession: "0001-24-000010",
  });
  const amendment = obs({
    metricKey: "cash",
    value: 1_250,
    fingerprint: "cash-amend",
    fiscalYear: 2024,
    fiscalPeriod: "Q2",
    periodEnd: new Date("2024-03-31T00:00:00.000Z"),
    periodLabel: "FY2024 Q2",
    filedAt: new Date("2024-05-15T00:00:00.000Z"),
    accession: "0001-24-000099",
  });
  const priorQ = obs({
    metricKey: "cash",
    value: 900,
    fingerprint: "cash-prior",
    fiscalYear: 2024,
    fiscalPeriod: "Q1",
    periodEnd: new Date("2023-12-30T00:00:00.000Z"),
    periodLabel: "FY2024 Q1",
    filedAt: new Date("2024-02-01T00:00:00.000Z"),
    accession: "0001-24-000001",
  });

  const deduped = dedupeAmendments([original, amendment, priorQ]);
  assert.equal(deduped.filter((d) => d.fiscalPeriod === "Q2").length, 1);
  assert.equal(
    deduped.find((d) => d.fiscalPeriod === "Q2")!.value,
    1_250
  );

  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [original, amendment, priorQ],
  });
  const cash = report.rows.find((r) => r.metricKey === "cash")!;
  assert.equal(cash.current!.value, 1_250);
  assert.equal(cash.comparable, true);
  assert.equal(cash.absoluteChange, 350);
});

test("restated values: later accession wins when filedAt ties", () => {
  const early = obs({
    metricKey: "shares_outstanding",
    value: 100,
    fingerprint: "sh-1",
    fiscalYear: 2024,
    fiscalPeriod: "Q3",
    periodEnd: new Date("2024-06-30T00:00:00.000Z"),
    filedAt: new Date("2024-08-01T00:00:00.000Z"),
    accession: "0001-24-000010",
  });
  const restated = obs({
    metricKey: "shares_outstanding",
    value: 105,
    fingerprint: "sh-2",
    fiscalYear: 2024,
    fiscalPeriod: "Q3",
    periodEnd: new Date("2024-06-30T00:00:00.000Z"),
    filedAt: new Date("2024-08-01T00:00:00.000Z"),
    accession: "0001-24-000050",
  });
  const prior = obs({
    metricKey: "shares_outstanding",
    value: 98,
    fingerprint: "sh-0",
    fiscalYear: 2024,
    fiscalPeriod: "Q2",
    periodEnd: new Date("2024-03-31T00:00:00.000Z"),
    filedAt: new Date("2024-05-01T00:00:00.000Z"),
    accession: "0001-24-000005",
  });

  const current = selectCurrentObservation(
    dedupeAmendments([early, restated, prior]),
    "shares_outstanding",
    false
  );
  assert.equal(current!.value, 105);

  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [early, restated, prior],
  });
  const sh = report.rows.find((r) => r.metricKey === "shares_outstanding")!;
  assert.equal(sh.current!.value, 105);
  assert.equal(sh.basis, "prior_filing");
  assert.equal(sh.absoluteChange, 7);
});

test("material emphasis thresholds for percent and bps", () => {
  const revCur = obs({
    metricKey: "revenue",
    value: 12_000,
    fingerprint: "r1",
    fiscalYear: 2024,
    fiscalPeriod: "Q1",
    periodStart: new Date("2023-10-01T00:00:00.000Z"),
    periodEnd: new Date("2023-12-30T00:00:00.000Z"),
    filedAt: new Date("2024-02-01T00:00:00.000Z"),
  });
  const revPrior = obs({
    metricKey: "revenue",
    value: 10_000,
    fingerprint: "r0",
    fiscalYear: 2023,
    fiscalPeriod: "Q1",
    periodStart: new Date("2022-10-01T00:00:00.000Z"),
    periodEnd: new Date("2022-12-31T00:00:00.000Z"),
    filedAt: new Date("2023-02-01T00:00:00.000Z"),
  });
  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [revCur, revPrior],
  });
  const rev = report.rows.find((r) => r.metricKey === "revenue")!;
  // +20% → material_higher
  assert.equal(rev.emphasis, "material_higher");
  assert.equal(rev.changeLabel, "Materially higher");
});

test("unreliable FCF is unavailable", () => {
  const fcf = obs({
    metricKey: "free_cash_flow",
    value: 100,
    fingerprint: "fcf1",
    fiscalYear: 2024,
    fiscalPeriod: "Q2",
    periodStart: new Date("2024-01-01T00:00:00.000Z"),
    periodEnd: new Date("2024-03-31T00:00:00.000Z"),
    filedAt: new Date("2024-05-01T00:00:00.000Z"),
    confidence: "low",
    sourceType: "derived",
  });
  const report = buildQuarterlyDeltaReport({
    symbol: "TEST",
    observations: [fcf],
  });
  const row = report.rows.find((r) => r.metricKey === "free_cash_flow")!;
  assert.equal(row.emphasis, "unavailable");
  assert.equal(row.comparable, false);
  assert.ok(row.unavailableReason);
});
