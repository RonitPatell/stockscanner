/**
 * Derived metrics: margins + free cash flow.
 * Always retain source observation metadata in evidence.
 * Missing inputs → skip (UNKNOWN), never fabricate zero.
 */

import { metricObservationFingerprint } from "./fingerprint.ts";
import { durationDays, durationsComparableForYoy } from "./periods.ts";
import type {
  FinancialMetricKey,
  NormalizedMetricObservation,
} from "./types.ts";

function periodKey(o: NormalizedMetricObservation): string {
  return [
    o.fiscalYear ?? "",
    o.fiscalPeriod ?? "",
    o.periodEnd?.toISOString().slice(0, 10) ?? "",
    o.periodStart?.toISOString().slice(0, 10) ?? "",
  ].join("|");
}

function samePeriod(
  a: NormalizedMetricObservation,
  b: NormalizedMetricObservation
): boolean {
  if (a.periodEnd && b.periodEnd) {
    if (a.periodEnd.toISOString().slice(0, 10) !== b.periodEnd.toISOString().slice(0, 10)) {
      return false;
    }
  } else {
    return false;
  }
  if (a.fiscalPeriod && b.fiscalPeriod && a.fiscalPeriod !== b.fiscalPeriod) {
    return false;
  }
  const da = durationDays(a.periodStart, a.periodEnd);
  const db = durationDays(b.periodStart, b.periodEnd);
  // Instant (cash) vs duration (revenue) for margins: revenue/gross need same duration
  if (a.periodStart && b.periodStart) {
    const cmp = durationsComparableForYoy(
      { fiscalPeriod: a.fiscalPeriod, days: da },
      { fiscalPeriod: b.fiscalPeriod, days: db }
    );
    if (!cmp.ok) return false;
  }
  return true;
}

function findPair(
  rows: NormalizedMetricObservation[],
  aKey: FinancialMetricKey,
  bKey: FinancialMetricKey
): { a: NormalizedMetricObservation; b: NormalizedMetricObservation }[] {
  const as = rows.filter((r) => r.metricKey === aKey && r.value != null);
  const bs = rows.filter((r) => r.metricKey === bKey && r.value != null);
  const pairs: { a: NormalizedMetricObservation; b: NormalizedMetricObservation }[] =
    [];
  for (const a of as) {
    for (const b of bs) {
      if (samePeriod(a, b) && a.unit === b.unit) {
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

function derivedObs(opts: {
  key: FinancialMetricKey;
  value: number;
  base: NormalizedMetricObservation;
  sources: NormalizedMetricObservation[];
  formula: string;
}): NormalizedMetricObservation {
  const concepts = opts.sources
    .map((s) => s.secConcept)
    .filter(Boolean)
    .join("+");
  const fingerprint = metricObservationFingerprint({
    symbol: opts.base.symbol,
    metricKey: opts.key,
    periodEnd: opts.base.periodEnd,
    fiscalYear: opts.base.fiscalYear,
    fiscalPeriod: opts.base.fiscalPeriod,
    accession: opts.base.accession,
    secConcept: `derived:${opts.key}`,
    sourceType: "derived",
  });

  return {
    symbol: opts.base.symbol,
    cik: opts.base.cik,
    metricKey: opts.key,
    value: opts.value,
    unit: opts.key.includes("margin") ? "percent" : opts.base.unit,
    currency: opts.key.includes("margin") ? null : opts.base.currency,
    periodStart: opts.base.periodStart,
    periodEnd: opts.base.periodEnd,
    periodLabel: opts.base.periodLabel,
    fiscalYear: opts.base.fiscalYear,
    fiscalPeriod: opts.base.fiscalPeriod,
    filedAt: opts.base.filedAt,
    accession: opts.base.accession,
    secConcept: `derived:${opts.key}`,
    sourceType: "derived",
    sourceId: opts.base.accession,
    sourceUrl: opts.base.sourceUrl,
    confidence:
      opts.sources.every((s) => s.confidence === "high") ? "high" : "medium",
    evidence: {
      formula: opts.formula,
      sourceFingerprints: opts.sources.map((s) => s.fingerprint),
      sourceConcepts: concepts,
      sourceValues: opts.sources.map((s) => ({
        metricKey: s.metricKey,
        value: s.value,
        concept: s.secConcept,
        accession: s.accession,
      })),
    },
    fingerprint,
  };
}

/**
 * Add gross_margin, operating_margin, free_cash_flow when inputs exist
 * for the same comparable period.
 */
export function deriveMetrics(
  extracted: NormalizedMetricObservation[]
): NormalizedMetricObservation[] {
  const derived: NormalizedMetricObservation[] = [];

  for (const { a: gp, b: rev } of findPair(
    extracted,
    "gross_profit",
    "revenue"
  )) {
    if (rev.value === 0 || rev.value == null || gp.value == null) continue;
    // Margin as percent points (30 = 30%)
    const margin = (gp.value / rev.value) * 100;
    if (!Number.isFinite(margin)) continue;
    derived.push(
      derivedObs({
        key: "gross_margin",
        value: margin,
        base: rev,
        sources: [gp, rev],
        formula: "gross_profit / revenue * 100",
      })
    );
  }

  for (const { a: oi, b: rev } of findPair(
    extracted,
    "operating_income",
    "revenue"
  )) {
    if (rev.value === 0 || rev.value == null || oi.value == null) continue;
    const margin = (oi.value / rev.value) * 100;
    if (!Number.isFinite(margin)) continue;
    // Operating margin only when revenue is meaningful (positive)
    if (rev.value <= 0) continue;
    derived.push(
      derivedObs({
        key: "operating_margin",
        value: margin,
        base: rev,
        sources: [oi, rev],
        formula: "operating_income / revenue * 100",
      })
    );
  }

  for (const { a: ocf, b: capex } of findPair(
    extracted,
    "operating_cash_flow",
    "capital_expenditures"
  )) {
    if (ocf.value == null || capex.value == null) continue;
    // CapEx stored as positive outflow magnitude
    const fcf = ocf.value - Math.abs(capex.value);
    if (!Number.isFinite(fcf)) continue;
    derived.push(
      derivedObs({
        key: "free_cash_flow",
        value: fcf,
        base: ocf,
        sources: [ocf, capex],
        formula: "operating_cash_flow - abs(capital_expenditures)",
      })
    );
  }

  // Dedupe derived by fingerprint
  const byFp = new Map<string, NormalizedMetricObservation>();
  for (const d of derived) byFp.set(d.fingerprint, d);
  return [...extracted, ...byFp.values()];
}

export function periodKeyOf(o: NormalizedMetricObservation): string {
  return periodKey(o);
}
