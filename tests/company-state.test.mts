/**
 * Company State Engine — deterministic trends and dimension builders.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  trendFromChange,
  combineTrends,
  formatSignedPercent,
} from "../src/lib/company-state/trend.ts";
import {
  buildGrowthDimension,
  buildShareStructureDimension,
} from "../src/lib/company-state/from-metrics.ts";
import type { NormalizedMetricObservation } from "../src/lib/metrics/types.ts";

function obs(
  partial: Partial<NormalizedMetricObservation> & {
    metricKey: NormalizedMetricObservation["metricKey"];
    value: number | null;
  }
): NormalizedMetricObservation {
  return {
    symbol: "RKLB",
    cik: "0001819994",
    unit: "USD",
    currency: "USD",
    periodStart: null,
    periodLabel: partial.periodLabel ?? "2026-Q2",
    fiscalYear: partial.fiscalYear ?? 2026,
    fiscalPeriod: partial.fiscalPeriod ?? "Q2",
    filedAt: new Date("2026-08-10T00:00:00.000Z"),
    accession: "acc-1",
    secConcept: "test",
    sourceType: "sec_companyfacts",
    sourceId: null,
    sourceUrl: "https://www.sec.gov/",
    confidence: "high",
    evidence: {},
    fingerprint: `fp-${partial.metricKey}-${partial.periodLabel ?? "x"}`,
    periodEnd: partial.periodEnd ?? new Date("2026-06-30T00:00:00.000Z"),
    ...partial,
  };
}

test("trendFromChange: revenue up is improving", () => {
  assert.equal(trendFromChange({ percentChange: 15 }), "improving");
});

test("trendFromChange: revenue down is deteriorating", () => {
  assert.equal(trendFromChange({ percentChange: -8 }), "deteriorating");
});

test("trendFromChange: small change is stable", () => {
  assert.equal(trendFromChange({ percentChange: 0.5 }), "stable");
});

test("trendFromChange: null change is unknown", () => {
  assert.equal(trendFromChange({ percentChange: null }), "unknown");
});

test("trendFromChange: debt down is improving when lowerIsBetter", () => {
  assert.equal(
    trendFromChange({ percentChange: -10, lowerIsBetter: true }),
    "improving"
  );
});

test("trendFromChange: margin bps uses bps threshold", () => {
  assert.equal(
    trendFromChange({ percentChange: null, bpsChange: 200 }),
    "improving"
  );
  assert.equal(
    trendFromChange({ percentChange: null, bpsChange: 10 }),
    "stable"
  );
});

test("combineTrends returns mixed on disagreement", () => {
  assert.equal(combineTrends("improving", "deteriorating"), "mixed");
});

test("formatSignedPercent handles null", () => {
  assert.equal(formatSignedPercent(null), null);
  assert.equal(formatSignedPercent(12.3), "+12.3%");
});

test("buildGrowthDimension never coerces missing revenue to zero", () => {
  const dim = buildGrowthDimension([]);
  assert.equal(dim.status, "unknown");
  assert.equal(dim.values.length, 0);
  assert.match(dim.summary, /unavailable/i);
});

test("buildGrowthDimension reports YoY when comparable periods exist", () => {
  const rows: NormalizedMetricObservation[] = [
    obs({
      metricKey: "revenue",
      value: 434_000_000,
      periodLabel: "2026-Q2",
      fiscalYear: 2026,
      fiscalPeriod: "Q2",
      periodEnd: new Date("2026-06-30T00:00:00.000Z"),
    }),
    obs({
      metricKey: "revenue",
      value: 200_000_000,
      periodLabel: "2025-Q2",
      fiscalYear: 2025,
      fiscalPeriod: "Q2",
      periodEnd: new Date("2025-06-30T00:00:00.000Z"),
    }),
  ];
  const dim = buildGrowthDimension(rows);
  assert.equal(dim.id, "growth");
  assert.ok(dim.values.length > 0);
  assert.ok(["ready", "partial"].includes(dim.status));
  if (dim.trend !== "unknown") {
    assert.equal(dim.trend, "improving");
  }
});

test("share structure uses lowerIsBetter for YoY share increase", () => {
  const rows: NormalizedMetricObservation[] = [
    obs({
      metricKey: "shares_outstanding",
      value: 600_000_000,
      unit: "shares",
      periodLabel: "2026-Q2",
      fiscalYear: 2026,
      fiscalPeriod: "Q2",
      periodEnd: new Date("2026-06-30T00:00:00.000Z"),
    }),
    obs({
      metricKey: "shares_outstanding",
      value: 500_000_000,
      unit: "shares",
      periodLabel: "2025-Q2",
      fiscalYear: 2025,
      fiscalPeriod: "Q2",
      periodEnd: new Date("2025-06-30T00:00:00.000Z"),
    }),
  ];
  const dim = buildShareStructureDimension(rows);
  assert.equal(dim.status, "ready");
  assert.ok(dim.values[0]!.value! > 500_000_000);
  assert.ok(["deteriorating", "unknown"].includes(dim.trend));
});

test("company state API route file exists", () => {
  assert.ok(
    existsSync(
      join(
        import.meta.dirname,
        "..",
        "src/app/api/ticker/[symbol]/company-state/route.ts"
      )
    )
  );
});
