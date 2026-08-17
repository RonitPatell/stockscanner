/**
 * Extract normalized metric observations from SEC companyfacts JSON.
 * Prefer canonical concepts; support aliases; never invent zeros.
 */

import { METRIC_CONCEPT_SPECS, type ConceptAlias } from "./concepts.ts";
import { metricObservationFingerprint } from "./fingerprint.ts";
import {
  classifyDurationBucket,
  formPreferenceScore,
  periodLabelFromParts,
  pointMeta,
} from "./periods.ts";
import type {
  FinancialMetricKey,
  MetricConfidence,
  NormalizedMetricObservation,
  SecCompanyfactsDocument,
  SecCompanyfactsUnitPoint,
} from "./types.ts";

function padCik(cik: number | string | null | undefined): string | null {
  if (cik == null) return null;
  const digits = String(cik).replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

function companyfactsUrl(cik: string): string {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function unitCandidates(
  units: Record<string, SecCompanyfactsUnitPoint[]> | undefined,
  preferred?: string[]
): { unit: string; points: SecCompanyfactsUnitPoint[] }[] {
  if (!units) return [];
  const keys = Object.keys(units);
  const ordered: string[] = [];
  for (const p of preferred ?? []) {
    if (keys.includes(p)) ordered.push(p);
  }
  for (const k of keys) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return ordered
    .map((unit) => ({ unit, points: units[unit] ?? [] }))
    .filter((u) => u.points.length > 0);
}

function scorePoint(
  p: SecCompanyfactsUnitPoint,
  wantKind: "instant" | "duration"
): number {
  const meta = pointMeta(p);
  let score = formPreferenceScore(meta.form);
  if (wantKind === "duration") {
    if (!meta.periodStart) score -= 5;
    const bucket = classifyDurationBucket(meta.days);
    if (bucket === "quarter" || bucket === "annual") score += 2;
    if (bucket === "other") score -= 2;
  } else {
    // Instant facts should not require start; penalize long durations masquerading
    if (meta.periodStart && meta.days != null && meta.days > 5) score -= 3;
    else score += 1;
  }
  if (meta.fiscalPeriod) score += 1;
  if (meta.accession) score += 1;
  if (meta.filedAt) score += 0.5;
  return score;
}

function pickBestPoint(
  points: SecCompanyfactsUnitPoint[],
  wantKind: "instant" | "duration"
): SecCompanyfactsUnitPoint | null {
  let best: SecCompanyfactsUnitPoint | null = null;
  let bestScore = -Infinity;
  for (const p of points) {
    if (!isFiniteNumber(p.val)) continue;
    if (!p.end) continue;
    if (wantKind === "duration" && !p.start) {
      // Allow annual frames without start only if fp is FY and form is 10-K — still weak
      const fp = (p.fp ?? "").toUpperCase();
      if (fp !== "FY") continue;
    }
    const s = scorePoint(p, wantKind);
    const filed = p.filed ? Date.parse(p.filed) : 0;
    const bestFiled = best?.filed ? Date.parse(best.filed) : 0;
    if (
      s > bestScore ||
      (s === bestScore && filed > bestFiled)
    ) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Among all points for a concept/unit, group by period identity and pick best
 * point per period, then return all periods (caller may filter).
 */
function pointsByPeriod(
  points: SecCompanyfactsUnitPoint[],
  wantKind: "instant" | "duration"
): Map<string, SecCompanyfactsUnitPoint> {
  const byPeriod = new Map<string, SecCompanyfactsUnitPoint[]>();
  for (const p of points) {
    if (!isFiniteNumber(p.val) || !p.end) continue;
    const meta = pointMeta(p);
    const key = [
      meta.fiscalYear ?? "x",
      meta.fiscalPeriod ?? "x",
      meta.periodEnd?.toISOString().slice(0, 10) ?? p.end,
      p.start ?? "",
    ].join("|");
    const list = byPeriod.get(key) ?? [];
    list.push(p);
    byPeriod.set(key, list);
  }
  const best = new Map<string, SecCompanyfactsUnitPoint>();
  for (const [k, list] of byPeriod) {
    const picked = pickBestPoint(list, wantKind);
    if (picked) best.set(k, picked);
  }
  return best;
}

function confidenceForPoint(
  p: SecCompanyfactsUnitPoint,
  aliasIndex: number
): MetricConfidence {
  const meta = pointMeta(p);
  const formOk = formPreferenceScore(meta.form) >= 3;
  if (aliasIndex === 0 && formOk && meta.accession) return "high";
  if (formOk) return "medium";
  if (aliasIndex <= 1) return "medium";
  return "low";
}

function observationFromPoint(opts: {
  symbol: string;
  cik: string | null;
  metricKey: FinancialMetricKey;
  alias: ConceptAlias;
  aliasIndex: number;
  unit: string;
  point: SecCompanyfactsUnitPoint;
}): NormalizedMetricObservation {
  const meta = pointMeta(opts.point);
  const value = opts.alias.treatAsOutflowMagnitude
    ? Math.abs(opts.point.val)
    : opts.point.val;
  const fiscalPeriod = meta.fiscalPeriod;
  const periodLabel = periodLabelFromParts({
    fiscalYear: meta.fiscalYear,
    fiscalPeriod,
    periodEnd: meta.periodEnd,
  });
  const fingerprint = metricObservationFingerprint({
    symbol: opts.symbol,
    metricKey: opts.metricKey,
    periodEnd: meta.periodEnd,
    fiscalYear: meta.fiscalYear,
    fiscalPeriod,
    accession: meta.accession,
    secConcept: opts.alias.concept,
    sourceType: "sec_companyfacts",
  });

  return {
    symbol: opts.symbol.toUpperCase(),
    cik: opts.cik,
    metricKey: opts.metricKey,
    value: Number.isFinite(value) ? value : null,
    unit: opts.unit,
    currency: opts.unit === "USD" || opts.unit.startsWith("USD") ? "USD" : null,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    periodLabel,
    fiscalYear: meta.fiscalYear,
    fiscalPeriod,
    filedAt: meta.filedAt,
    accession: meta.accession,
    secConcept: opts.alias.concept,
    sourceType: "sec_companyfacts",
    sourceId: meta.accession,
    sourceUrl: opts.cik ? companyfactsUrl(opts.cik) : null,
    confidence: confidenceForPoint(opts.point, opts.aliasIndex),
    evidence: {
      taxonomy: opts.alias.taxonomy,
      concept: opts.alias.concept,
      form: meta.form,
      frame: opts.point.frame ?? null,
      rawVal: opts.point.val,
      durationDays: meta.days,
      aliasIndex: opts.aliasIndex,
    },
    fingerprint,
  };
}

/**
 * Extract all periods for extractable metrics from a companyfacts document.
 * Derived metrics (margins, FCF) are added by `deriveMetrics`.
 */
export function extractMetricsFromCompanyfacts(opts: {
  symbol: string;
  doc: SecCompanyfactsDocument;
  cik?: string | null;
}): NormalizedMetricObservation[] {
  const symbol = opts.symbol.trim().toUpperCase();
  const cik = padCik(opts.cik ?? opts.doc.cik) ;
  const facts = opts.doc.facts ?? {};
  const out: NormalizedMetricObservation[] = [];
  /** Dedupe within extraction: fingerprint → best confidence observation */
  const byFp = new Map<string, NormalizedMetricObservation>();

  for (const spec of METRIC_CONCEPT_SPECS) {
    let matched = false;
    for (let ai = 0; ai < spec.aliases.length; ai++) {
      const alias = spec.aliases[ai]!;
      const taxonomy = facts[alias.taxonomy];
      if (!taxonomy) continue;
      const concept = taxonomy[alias.concept];
      if (!concept?.units) continue;

      const units = unitCandidates(concept.units, alias.preferredUnits);
      for (const { unit, points } of units) {
        if (spec.preferPureUsd && unit !== "USD" && !unit.startsWith("USD")) {
          // allow USD/shares only for EPS
          if (spec.key !== "eps_diluted") continue;
        }
        const periodMap = pointsByPeriod(points, alias.kind);
        for (const point of periodMap.values()) {
          const obs = observationFromPoint({
            symbol,
            cik,
            metricKey: spec.key,
            alias,
            aliasIndex: ai,
            unit,
            point,
          });
          if (obs.value == null) continue;
          const existing = byFp.get(obs.fingerprint);
          if (!existing) {
            byFp.set(obs.fingerprint, obs);
          } else {
            // Prefer earlier alias (canonical) and higher confidence
            const rank = (c: MetricConfidence) =>
              ({ high: 3, medium: 2, low: 1, unknown: 0 })[c];
            if (rank(obs.confidence) > rank(existing.confidence)) {
              byFp.set(obs.fingerprint, obs);
            }
          }
          matched = true;
        }
      }
      // First alias that produced any points wins for this metric key family
      // but we still allow multiple periods — stop trying weaker aliases only
      // when we already have coverage for the same periods? Simpler: try all
      // aliases but fingerprint includes concept so same period different
      // concepts are different rows — then collapse by period preferring
      // lower aliasIndex.
      if (matched && ai === 0) {
        // keep going to collect more periods from same concept; don't skip
      }
    }
  }

  // Collapse same metric+period across concepts: keep lowest aliasIndex
  const byPeriodKey = new Map<string, NormalizedMetricObservation>();
  for (const obs of byFp.values()) {
    const pk = [
      obs.metricKey,
      obs.fiscalYear ?? "",
      obs.fiscalPeriod ?? "",
      obs.periodEnd?.toISOString().slice(0, 10) ?? "",
      obs.periodStart?.toISOString().slice(0, 10) ?? "",
    ].join("|");
    const prev = byPeriodKey.get(pk);
    if (!prev) {
      byPeriodKey.set(pk, obs);
      continue;
    }
    const prevIdx = Number(prev.evidence.aliasIndex ?? 99);
    const nextIdx = Number(obs.evidence.aliasIndex ?? 99);
    if (nextIdx < prevIdx) byPeriodKey.set(pk, obs);
  }

  out.push(...byPeriodKey.values());
  return out;
}
