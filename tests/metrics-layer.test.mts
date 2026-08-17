/**
 * Financial metric layer — extraction, aliases, deltas, UNKNOWN safety.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
  FIXTURE_SPARSE_COMPANYFACTS,
  FIXTURE_TECH_COMPANYFACTS,
} from "./fixtures/companyfacts.ts";
import {
  classifyDurationBucket,
  durationsComparableForYoy,
} from "../src/lib/metrics/periods.ts";
import { FINANCIAL_METRIC_KEYS } from "../src/lib/metrics/types.ts";
import { metricObservationFingerprint } from "../src/lib/metrics/fingerprint.ts";
import { normalizeCompanyfactsMetrics } from "../src/lib/metrics/pipeline.ts";
import {
  computeMarginBpsChange,
  computeQoqDelta,
  computeShareCountChange,
  computeYoyDelta,
} from "../src/lib/metrics/deltas.ts";

test("financial metric key registry covers required monitoring set", () => {
  for (const k of [
    "revenue",
    "gross_profit",
    "gross_margin",
    "operating_income",
    "operating_margin",
    "net_income",
    "operating_cash_flow",
    "capital_expenditures",
    "free_cash_flow",
    "cash",
    "total_debt",
    "diluted_shares",
    "shares_outstanding",
    "eps_diluted",
  ] as const) {
    assert.ok((FINANCIAL_METRIC_KEYS as readonly string[]).includes(k));
  }
});

test("tech fixture extracts revenue, margins, FCF, shares, EPS", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const keys = new Set(rows.map((r) => r.metricKey));
  assert.ok(keys.has("revenue"));
  assert.ok(keys.has("gross_profit"));
  assert.ok(keys.has("gross_margin"));
  assert.ok(keys.has("operating_margin"));
  assert.ok(keys.has("free_cash_flow"));
  assert.ok(keys.has("cash"));
  assert.ok(keys.has("diluted_shares"));
  assert.ok(keys.has("shares_outstanding"));
  assert.ok(keys.has("eps_diluted"));

  const q3Rev = rows.find(
    (r) =>
      r.metricKey === "revenue" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  );
  assert.ok(q3Rev);
  assert.equal(q3Rev!.value, 28_000);
  assert.equal(q3Rev!.secConcept, "RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.ok(q3Rev!.accession);
  assert.ok(q3Rev!.periodStart);
  assert.ok(q3Rev!.periodEnd);

  const margin = rows.find(
    (r) =>
      r.metricKey === "gross_margin" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  );
  assert.ok(margin);
  assert.ok(margin!.value != null);
  assert.ok(Math.abs(margin!.value! - 50) < 0.01); // 14000/28000
  assert.equal(margin!.sourceType, "derived");
  assert.ok(Array.isArray(margin!.evidence.sourceFingerprints));
  assert.ok((margin!.evidence.sourceFingerprints as string[]).length >= 2);

  const fcf = rows.find(
    (r) =>
      r.metricKey === "free_cash_flow" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  );
  assert.ok(fcf);
  assert.equal(fcf!.value, 7_000); // 9000 - 2000
  assert.equal(fcf!.evidence.formula, "operating_cash_flow - abs(capital_expenditures)");
});

test("legacy SalesRevenueNet alias extracts revenue", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "LEGACY",
    doc: FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
  });
  const rev = rows.filter((r) => r.metricKey === "revenue");
  assert.ok(rev.length >= 2);
  assert.equal(rev[0]!.secConcept, "SalesRevenueNet");
  const margin = rows.find(
    (r) => r.metricKey === "gross_margin" && r.fiscalPeriod === "Q1"
  );
  assert.ok(margin);
  assert.ok(Math.abs(margin!.value! - 40) < 0.01);
});

test("sparse fixture: cash/debt/shares present; no fabricated revenue", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "SPARSE",
    doc: FIXTURE_SPARSE_COMPANYFACTS,
  });
  assert.ok(rows.some((r) => r.metricKey === "cash" && r.value === 3_000));
  assert.ok(rows.some((r) => r.metricKey === "total_debt" && r.value === 8_000));
  assert.ok(rows.some((r) => r.metricKey === "shares_outstanding"));
  assert.equal(
    rows.some((r) => r.metricKey === "revenue"),
    false
  );
  assert.equal(
    rows.some((r) => r.metricKey === "gross_margin"),
    false
  );
  assert.equal(
    rows.some((r) => r.metricKey === "free_cash_flow"),
    false
  );
});

test("YoY revenue change when periods comparable", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const q3_2024 = rows.find(
    (r) =>
      r.metricKey === "revenue" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  )!;
  const yoy = computeYoyDelta(q3_2024, rows);
  assert.equal(yoy.comparable, true);
  assert.ok(yoy.prior);
  assert.equal(yoy.prior!.fiscalYear, 2023);
  assert.equal(yoy.absoluteChange, 6_000);
  assert.ok(yoy.percentChange != null);
  assert.ok(Math.abs(yoy.percentChange! - (6000 / 22000) * 100) < 0.01);
});

test("QoQ revenue when consecutive quarters", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const q3 = rows.find(
    (r) =>
      r.metricKey === "revenue" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  )!;
  const qoq = computeQoqDelta(q3, rows);
  assert.equal(qoq.comparable, true);
  assert.equal(qoq.prior!.fiscalPeriod, "Q2");
  assert.equal(qoq.absoluteChange, 3_000);
});

test("incomparable half-year vs quarter yields UNKNOWN YoY", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "SPARSE",
    doc: FIXTURE_SPARSE_COMPANYFACTS,
  });
  const weird = rows.find(
    (r) =>
      r.metricKey === "net_income" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q2"
  );
  assert.ok(weird);
  // ~181 days → "other" bucket
  assert.equal(
    classifyDurationBucket(
      Math.round(
        (weird!.periodEnd!.getTime() - weird!.periodStart!.getTime()) /
          86_400_000
      )
    ),
    "other"
  );
  const yoy = computeYoyDelta(weird!, rows);
  assert.equal(yoy.comparable, false);
  assert.equal(yoy.absoluteChange, null);
  assert.equal(yoy.percentChange, null);
  assert.ok(yoy.reason);
});

test("margin bps change retains UNKNOWN when prior missing", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "LEGACY",
    doc: FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
  });
  const margin = rows.find((r) => r.metricKey === "gross_margin")!;
  const bps = computeMarginBpsChange(margin, rows, "yoy");
  // Only one margin period in legacy fixture
  assert.equal(bps.comparable, false);
  assert.equal(bps.bpsChange, null);
});

test("share-count YoY percent change", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const shares = rows.find(
    (r) =>
      r.metricKey === "diluted_shares" &&
      r.fiscalYear === 2024 &&
      r.fiscalPeriod === "Q3"
  )!;
  const delta = computeShareCountChange(shares, rows, "yoy");
  assert.equal(delta.comparable, true);
  assert.equal(delta.absoluteChange, 100);
  assert.ok(delta.percentChange != null);
});

test("fingerprint is stable and dedupes", () => {
  const a = metricObservationFingerprint({
    symbol: "aapl",
    metricKey: "revenue",
    periodEnd: "2024-06-29",
    fiscalYear: 2024,
    fiscalPeriod: "Q3",
    accession: "0000320193-24-000050",
    secConcept: "RevenueFromContractWithCustomerExcludingAssessedTax",
  });
  const b = metricObservationFingerprint({
    symbol: "AAPL",
    metricKey: "revenue",
    periodEnd: new Date("2024-06-29T00:00:00.000Z"),
    fiscalYear: 2024,
    fiscalPeriod: "Q3",
    accession: "0000320193-24-000050",
    secConcept: "RevenueFromContractWithCustomerExcludingAssessedTax",
  });
  assert.equal(a, b);

  const rows = normalizeCompanyfactsMetrics({
    symbol: "AAPL",
    doc: FIXTURE_TECH_COMPANYFACTS,
  });
  const fps = rows.map((r) => r.fingerprint);
  assert.equal(new Set(fps).size, fps.length);
});

test("never coerces missing values to zero in deltas", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "SPARSE",
    doc: FIXTURE_SPARSE_COMPANYFACTS,
  });
  const cash = rows.find((r) => r.metricKey === "cash")!;
  const yoy = computeYoyDelta(cash, rows);
  assert.equal(yoy.comparable, false);
  assert.equal(yoy.percentChange, null);
  assert.equal(yoy.absoluteChange, null);
});

test("duration compatibility rejects mixed buckets", () => {
  const cmp = durationsComparableForYoy(
    { fiscalPeriod: "Q2", days: 91 },
    { fiscalPeriod: "Q2", days: 180 }
  );
  assert.equal(cmp.ok, false);
});

test("persist dedupe (optional DB)", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const { ingestCompanyfactsMetrics } = await import(
    "../src/lib/metrics/pipeline.ts"
  );
  const { prisma } = await import("../src/lib/prisma.ts");
  const symbol = `M${Date.now().toString(36).toUpperCase()}`.slice(0, 5);

  try {
    const first = await ingestCompanyfactsMetrics({
      symbol,
      doc: FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
      persist: true,
    });
    assert.ok(first.upserted > 0);
    const second = await ingestCompanyfactsMetrics({
      symbol,
      doc: FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
      persist: true,
    });
    assert.equal(second.upserted, first.upserted);
    const count = await prisma.metricObservation.count({ where: { symbol } });
    assert.equal(count, first.upserted);
  } finally {
    await prisma.metricObservation.deleteMany({ where: { symbol } });
  }
});
