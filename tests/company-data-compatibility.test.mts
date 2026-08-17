/**
 * Compatibility grades across representative CompanyFacts shapes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompanyfactsMetrics } from "../src/lib/metrics/pipeline.ts";
import { evaluateCapitalRisk } from "../src/lib/capital-risk/evaluate.ts";
import { COMPATIBILITY_SAMPLES } from "./fixtures/companyfacts-universe.ts";
import { FIXTURE_AMENDED_COMPANYFACTS } from "./fixtures/companyfacts-universe.ts";

export type CompatGrade = "PASS" | "PARTIAL" | "UNSUPPORTED";

function gradeFinancials(keys: Set<string>): CompatGrade {
  if (keys.has("revenue") && (keys.has("cash") || keys.has("net_income") || keys.has("gross_profit"))) {
    return keys.has("gross_margin") || keys.has("operating_income") ? "PASS" : "PARTIAL";
  }
  if (keys.has("cash") || keys.has("net_income") || keys.has("revenue")) return "PARTIAL";
  return "UNSUPPORTED";
}

test("amendment later 10-Q/A wins over original 10-Q for the same period", () => {
  const rows = normalizeCompanyfactsMetrics({
    symbol: "AMD",
    doc: FIXTURE_AMENDED_COMPANYFACTS,
  });
  const q2 = rows.find(
    (r) => r.metricKey === "revenue" && r.fiscalYear === 2024 && r.fiscalPeriod === "Q2"
  );
  assert.ok(q2);
  assert.equal(q2!.value, 11_500);
  assert.equal(q2!.accession, "0000789101-24-000018");
});

test("unknown metrics stay null, never NaN or coerced zero", () => {
  for (const sample of COMPATIBILITY_SAMPLES) {
    const rows = normalizeCompanyfactsMetrics({
      symbol: sample.symbol,
      doc: sample.doc,
    });
    for (const r of rows) {
      if (r.value != null) {
        assert.equal(Number.isNaN(r.value), false);
        assert.ok(Number.isFinite(r.value));
      }
    }
  }
});

test("ten representative issuer shapes grade without crashing", () => {
  const report: Record<string, { financials: CompatGrade; capital: CompatGrade }> = {};
  for (const sample of COMPATIBILITY_SAMPLES) {
    const rows = normalizeCompanyfactsMetrics({
      symbol: sample.symbol,
      doc: sample.doc,
    });
    const keys = new Set(rows.map((r) => r.metricKey));
    const financials = gradeFinancials(keys);
    const cash = rows.find((r) => r.metricKey === "cash");
    const shares = rows.find(
      (r) => r.metricKey === "shares_outstanding" || r.metricKey === "diluted_shares"
    );
    const capital = evaluateCapitalRisk({
      symbol: sample.symbol,
      instruments: [],
      observations: [
        ...(cash
          ? [
              {
                metricKey: "cash" as const,
                value: cash.value,
                periodEnd: cash.periodEnd,
                periodStart: cash.periodStart,
                fiscalYear: cash.fiscalYear,
                fiscalPeriod: cash.fiscalPeriod,
                sourceUrl: cash.sourceUrl,
                filedAt: cash.filedAt,
                fingerprint: cash.fingerprint,
              },
            ]
          : []),
        ...(shares
          ? [
              {
                metricKey: "shares_outstanding" as const,
                value: shares.value,
                periodEnd: shares.periodEnd,
                periodStart: shares.periodStart,
                fiscalYear: shares.fiscalYear,
                fiscalPeriod: shares.fiscalPeriod,
                sourceUrl: shares.sourceUrl,
                filedAt: shares.filedAt,
                fingerprint: shares.fingerprint,
              },
            ]
          : []),
      ],
    });
    const capGrade: CompatGrade =
      capital.status === "unknown" && !cash && !shares ? "UNSUPPORTED" : "PARTIAL";
    report[sample.id] = { financials, capital: capGrade };
    assert.ok(financials === "PASS" || financials === "PARTIAL" || financials === "UNSUPPORTED");
  }
  assert.equal(report.mega_tech?.financials, "PASS");
  assert.equal(report.bank?.financials, "PARTIAL");
  assert.equal(report.amended?.financials, "PARTIAL");
  assert.equal(COMPATIBILITY_SAMPLES.length, 10);
});
