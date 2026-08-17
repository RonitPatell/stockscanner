/**
 * Business Change Fingerprint — multi-window trends.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessChangeFingerprint } from "../src/lib/company-state/fingerprint.ts";
import type { NormalizedMetricObservation } from "../src/lib/metrics/types.ts";

function obs(
  partial: Partial<NormalizedMetricObservation> & {
    metricKey: NormalizedMetricObservation["metricKey"];
    value: number;
    fiscalYear: number;
    fiscalPeriod: string;
  }
): NormalizedMetricObservation {
  return {
    symbol: "TEST",
    cik: null,
    unit: "USD",
    currency: "USD",
    periodStart: null,
    periodLabel: `${partial.fiscalYear}-${partial.fiscalPeriod}`,
    filedAt: new Date("2026-01-01T00:00:00.000Z"),
    accession: "acc",
    secConcept: "test",
    sourceType: "sec_companyfacts",
    sourceId: null,
    sourceUrl: "https://www.sec.gov/",
    confidence: "high",
    evidence: {},
    fingerprint: `fp-${partial.metricKey}-${partial.fiscalYear}-${partial.fiscalPeriod}`,
    periodEnd: new Date(`${partial.fiscalYear}-06-30T00:00:00.000Z`),
    ...partial,
  };
}

test("fingerprint returns rows for core dimensions", () => {
  const fp = buildBusinessChangeFingerprint("TEST", [
    obs({ metricKey: "revenue", value: 100, fiscalYear: 2026, fiscalPeriod: "Q2" }),
    obs({ metricKey: "revenue", value: 80, fiscalYear: 2025, fiscalPeriod: "Q2" }),
  ]);
  assert.equal(fp.symbol, "TEST");
  assert.ok(fp.rows.length >= 8);
  const rev = fp.rows.find((r) => r.key === "revenue");
  assert.ok(rev);
  assert.equal(rev!.cells.length, 3);
});

test("fingerprint uses empty arrow when trend unknown", () => {
  const fp = buildBusinessChangeFingerprint("X", []);
  const rev = fp.rows.find((r) => r.key === "revenue");
  assert.ok(rev);
  for (const cell of rev!.cells) {
    assert.equal(cell.arrow, "");
    assert.equal(cell.trend, "unknown");
  }
});

test("fingerprint never fabricates zero for missing metrics", () => {
  const fp = buildBusinessChangeFingerprint("X", []);
  for (const row of fp.rows) {
    for (const cell of row.cells) {
      assert.notEqual(cell.percentChange, 0);
    }
  }
});
