/**
 * Deterministic Thesis Health evaluation (pure).
 * Inputs: conditions + metrics + events + capital snapshot.
 * Outputs: PASS | WARN | FAIL | UNKNOWN per automated condition + summary counts.
 * Never produces portfolio-wide investment recommendations or a composite stock score.
 */

import {
  computeQoqDelta,
  computeYoyDelta,
} from "../../metrics/deltas.ts";
import type { NormalizedMetricObservation } from "../../metrics/types.ts";
import type {
  GrowthPeriod,
  ThesisConditionEvalState,
  ThesisConditionPolarity,
  ThesisConditionType,
  ThesisHealthStatus,
  ThesisMetricKey,
} from "../types.ts";
import {
  capitalRiskExceedsMax,
  isCapitalRiskStatus,
} from "./capital-rank.ts";
import { thesisMetricToFinancialKey } from "./metrics-map.ts";
import type {
  ThesisConditionHealthResult,
  ThesisHealthCompanyEvent,
  ThesisHealthConditionInput,
  ThesisHealthContext,
  ThesisHealthEvaluationResult,
  ThesisHealthEvidence,
  ThesisHealthMetricObservation,
  ThesisHealthSummaryCounts,
} from "./types.ts";
import { THESIS_HEALTH_ENGINE_VERSION } from "./types.ts";

/** Capital registration / shelf capacity event types — WARN vs FAIL by polarity. */
const CAPITAL_REGISTRATION_EVENT_TYPES = new Set([
  "sec_s3",
  "sec_s3_a",
  "sec_s1",
  "sec_s1_a",
  "shelf_registration",
  "s1_registration",
]);

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function asMetricKey(v: unknown): ThesisMetricKey | null {
  return typeof v === "string" ? (v as ThesisMetricKey) : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asPeriod(v: unknown): GrowthPeriod {
  return v === "qoq" ? "qoq" : "yoy";
}

function asEventType(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asPolarity(v: string): ThesisConditionPolarity {
  if (v === "risk_if" || v === "invalidate_if" || v === "support_if") return v;
  return "support_if";
}

function engineEvidence(label: string): ThesisHealthEvidence {
  return { sourceType: "engine", label };
}

function noneEvidence(label: string): ThesisHealthEvidence {
  return { sourceType: "none", label };
}

function observationToNormalized(
  o: ThesisHealthMetricObservation,
  symbol: string
): NormalizedMetricObservation {
  return {
    symbol,
    cik: null,
    metricKey: o.metricKey as NormalizedMetricObservation["metricKey"],
    value: o.value,
    unit: o.unit,
    currency: null,
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    periodLabel: o.periodLabel,
    fiscalYear: o.fiscalYear,
    fiscalPeriod: o.fiscalPeriod,
    filedAt: o.filedAt,
    accession: o.accession,
    secConcept: o.secConcept,
    sourceType:
      o.sourceType === "derived" ? "derived" : "sec_companyfacts",
    sourceId: null,
    sourceUrl: o.sourceUrl,
    confidence:
      o.confidence === "high" ||
      o.confidence === "medium" ||
      o.confidence === "low"
        ? o.confidence
        : "unknown",
    evidence: o.evidence,
    fingerprint: o.fingerprint,
  };
}

function metricEvidence(
  o: ThesisHealthMetricObservation
): ThesisHealthEvidence {
  return {
    sourceType: "metric_observation",
    sourceUrl: o.sourceUrl,
    sourceId: o.accession,
    accession: o.accession,
    metricFingerprint: o.fingerprint,
    label:
      o.periodLabel ||
      (o.fiscalYear != null && o.fiscalPeriod
        ? `FY${o.fiscalYear} ${o.fiscalPeriod}`
        : o.accession
          ? `Accession ${o.accession}`
          : "Metric observation"),
  };
}

function eventEvidence(ev: ThesisHealthCompanyEvent): ThesisHealthEvidence {
  return {
    sourceType: "company_event",
    sourceUrl: ev.sourceUrl,
    sourceId: ev.sourceId,
    companyEventId: ev.id,
    label: ev.title || ev.eventType,
  };
}

function isQuarterPeriod(fp: string | null | undefined): boolean {
  return fp === "Q1" || fp === "Q2" || fp === "Q3" || fp === "Q4";
}

function pickLatestLevel(
  pool: ThesisHealthMetricObservation[],
  financialKey: string,
  opts?: { preferQuarter?: boolean }
): ThesisHealthMetricObservation | null {
  const rows = pool
    .filter((p) => p.metricKey === financialKey && p.value != null)
    .sort((a, b) => {
      if (opts?.preferQuarter) {
        const aq = isQuarterPeriod(a.fiscalPeriod) ? 1 : 0;
        const bq = isQuarterPeriod(b.fiscalPeriod) ? 1 : 0;
        if (bq !== aq) return bq - aq;
      }
      const ae = a.periodEnd?.getTime() ?? 0;
      const be = b.periodEnd?.getTime() ?? 0;
      if (be !== ae) return be - ae;
      return (b.filedAt?.getTime() ?? 0) - (a.filedAt?.getTime() ?? 0);
    });
  return rows[0] ?? null;
}

/**
 * Instant share counts often lack periodStart; deltas.ts rejects unknown duration.
 * When fiscalYear+fiscalPeriod match, compute percent change directly.
 */
function instantShareYoyGrowth(
  current: ThesisHealthMetricObservation,
  pool: ThesisHealthMetricObservation[]
): { percentChange: number; prior: ThesisHealthMetricObservation } | null {
  if (current.fiscalYear == null || !current.fiscalPeriod) return null;
  if (current.value == null) return null;
  const prior = pool.find(
    (p) =>
      p.metricKey === current.metricKey &&
      p.fingerprint !== current.fingerprint &&
      p.value != null &&
      p.fiscalYear === current.fiscalYear! - 1 &&
      p.fiscalPeriod === current.fiscalPeriod
  );
  if (!prior || prior.value == null || prior.value === 0) return null;
  const pct = ((current.value - prior.value) / Math.abs(prior.value)) * 100;
  if (!Number.isFinite(pct)) return null;
  return { percentChange: pct, prior };
}

function baseResult(
  c: ThesisHealthConditionInput,
  evaluatedAt: string,
  partial: Partial<ThesisConditionHealthResult> &
    Pick<ThesisConditionHealthResult, "state" | "mode" | "explanation" | "evidence">
): ThesisConditionHealthResult {
  return {
    conditionId: c.id,
    conditionType: c.conditionType,
    label: c.label,
    polarity: asPolarity(c.polarity),
    observationDate: null,
    actualValue: null,
    threshold: null,
    evaluatedAt,
    ...partial,
  };
}

function compareAbove(
  actual: number,
  threshold: number
): ThesisConditionEvalState {
  return actual > threshold ? "PASS" : "FAIL";
}

function compareBelow(
  actual: number,
  threshold: number
): ThesisConditionEvalState {
  return actual < threshold ? "PASS" : "FAIL";
}

function evaluateMetricLevel(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext,
  mode: "above" | "below"
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const metricKey = asMetricKey(c.params.metricKey);
  const threshold = asNumber(c.params.threshold);
  if (!metricKey || threshold == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
      threshold,
    });
  }

  const financialKey = thesisMetricToFinancialKey(metricKey);
  if (!financialKey) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: `Metric "${metricKey}" is not available from normalized financial observations`,
      evidence: engineEvidence(`Unsupported thesis metric: ${metricKey}`),
      threshold,
    });
  }

  const current = pickLatestLevel(ctx.observations, financialKey, {
    preferQuarter: true,
  });
  if (!current || current.value == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: `No observation available for ${metricKey}`,
      evidence: noneEvidence(`No MetricObservation for ${financialKey}`),
      threshold,
    });
  }

  const state =
    mode === "above"
      ? compareAbove(current.value, threshold)
      : compareBelow(current.value, threshold);
  const cmp = mode === "above" ? ">" : "<";

  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state,
    explanation: `${metricKey} is ${current.value} (threshold ${cmp} ${threshold})`,
    observationDate: toIso(current.periodEnd ?? current.filedAt),
    actualValue: current.value,
    threshold,
    evidence: metricEvidence(current),
  });
}

function evaluateMetricGrowth(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext,
  mode: "above" | "below"
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const metricKey = asMetricKey(c.params.metricKey);
  const threshold = asNumber(c.params.thresholdPercent);
  const period = asPeriod(c.params.period);
  if (!metricKey || threshold == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
      threshold,
    });
  }

  const financialKey = thesisMetricToFinancialKey(metricKey);
  if (!financialKey) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: `Metric "${metricKey}" is not available for growth comparison`,
      evidence: engineEvidence(`Unsupported thesis metric: ${metricKey}`),
      threshold,
    });
  }

  const pool = ctx.observations
    .filter((o) => o.metricKey === financialKey)
    .map((o) => observationToNormalized(o, ctx.symbol));
  const currentObs = pickLatestLevel(ctx.observations, financialKey, {
    preferQuarter: true,
  });
  if (!currentObs || currentObs.value == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: `No observation available for ${metricKey} growth`,
      evidence: noneEvidence(`No MetricObservation for ${financialKey}`),
      threshold,
    });
  }

  const currentNorm = observationToNormalized(currentObs, ctx.symbol);
  const delta =
    period === "qoq"
      ? computeQoqDelta(currentNorm, pool)
      : computeYoyDelta(currentNorm, pool);

  if (!delta.comparable || delta.percentChange == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation:
        delta.reason ??
        `${period.toUpperCase()} growth for ${metricKey} is not comparable`,
      observationDate: toIso(currentObs.periodEnd ?? currentObs.filedAt),
      actualValue: null,
      threshold,
      evidence: metricEvidence(currentObs),
    });
  }

  const pct = delta.percentChange;
  const state =
    mode === "above" ? compareAbove(pct, threshold) : compareBelow(pct, threshold);
  const cmp = mode === "above" ? ">" : "<";

  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state,
    explanation: `${metricKey} ${period.toUpperCase()} growth is ${pct.toFixed(1)}% (threshold ${cmp} ${threshold}%)`,
    observationDate: toIso(currentObs.periodEnd ?? currentObs.filedAt),
    actualValue: pct,
    threshold,
    evidence: metricEvidence(currentObs),
  });
}

function eventsAfterThesisStart(
  events: ThesisHealthCompanyEvent[],
  eventType: string,
  thesisCreatedAt: Date
): ThesisHealthCompanyEvent[] {
  const startMs = thesisCreatedAt.getTime();
  return events
    .filter(
      (e) => e.eventType === eventType && e.occurredAt.getTime() >= startMs
    )
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

/**
 * Explicit rule for NO_EVENT_TYPE when a matching event exists after thesis start:
 * - Capital registration / shelf types: invalidate_if|risk_if → FAIL; support_if → WARN
 * - All other event types → FAIL
 */
function noEventBreachState(
  eventType: string,
  polarity: ThesisConditionPolarity
): ThesisConditionEvalState {
  if (CAPITAL_REGISTRATION_EVENT_TYPES.has(eventType)) {
    if (polarity === "support_if") return "WARN";
    return "FAIL";
  }
  return "FAIL";
}

function evaluateNoEventType(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const eventType = asEventType(c.params.eventType);
  const polarity = asPolarity(c.polarity);
  if (!eventType) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
    });
  }

  const hits = eventsAfterThesisStart(
    ctx.events,
    eventType,
    ctx.thesisCreatedAt
  );
  if (hits.length === 0) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "PASS",
      explanation: `No ${eventType} event detected after thesis start (${ctx.thesisCreatedAt.toISOString()})`,
      evidence: engineEvidence(
        `Scanned CompanyEvents for ${eventType} since thesis start`
      ),
    });
  }

  const hit = hits[0]!;
  const state = noEventBreachState(eventType, polarity);
  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state,
    explanation: `${eventType} detected after thesis start: ${hit.title}`,
    observationDate: hit.occurredAt.toISOString(),
    evidence: eventEvidence(hit),
  });
}

function evaluateEventOccurred(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const eventType = asEventType(c.params.eventType);
  if (!eventType) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
    });
  }

  const hits = eventsAfterThesisStart(
    ctx.events,
    eventType,
    ctx.thesisCreatedAt
  );
  if (hits.length === 0) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "FAIL",
      explanation: `Expected ${eventType} after thesis start; none found`,
      evidence: engineEvidence(
        `Scanned CompanyEvents for ${eventType} since thesis start`
      ),
    });
  }

  const hit = hits[0]!;
  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state: "PASS",
    explanation: `${eventType} observed: ${hit.title}`,
    observationDate: hit.occurredAt.toISOString(),
    evidence: eventEvidence(hit),
  });
}

function evaluateShareCountChangeBelow(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const threshold = asNumber(c.params.thresholdPercent);
  const period = asPeriod(c.params.period);
  if (threshold == null) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
    });
  }

  // Prefer shares outstanding; fall back to diluted weighted-average shares.
  const keys = ["shares_outstanding", "diluted_shares"] as const;
  for (const financialKey of keys) {
    const currentObs = pickLatestLevel(ctx.observations, financialKey, {
      preferQuarter: true,
    });
    if (!currentObs || currentObs.value == null) continue;

    const keyPool = ctx.observations.filter((o) => o.metricKey === financialKey);
    const pool = keyPool.map((o) => observationToNormalized(o, ctx.symbol));
    const currentNorm = observationToNormalized(currentObs, ctx.symbol);
    const delta =
      period === "qoq"
        ? computeQoqDelta(currentNorm, pool)
        : computeYoyDelta(currentNorm, pool);

    let pct = delta.comparable ? delta.percentChange : null;
    let evidenceObs = currentObs;

    if (pct == null && period === "yoy") {
      const instant = instantShareYoyGrowth(currentObs, keyPool);
      if (instant) {
        pct = instant.percentChange;
        evidenceObs = currentObs;
      }
    }

    if (pct == null) {
      return baseResult(c, evaluatedAt, {
        mode: "automated",
        state: "UNKNOWN",
        explanation:
          delta.reason ??
          `Share-count ${period.toUpperCase()} change is not comparable`,
        observationDate: toIso(currentObs.periodEnd ?? currentObs.filedAt),
        threshold,
        evidence: metricEvidence(currentObs),
      });
    }

    const state = compareBelow(pct, threshold);
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state,
      explanation: `${financialKey} ${period.toUpperCase()} change is ${pct.toFixed(1)}% (threshold < ${threshold}%)`,
      observationDate: toIso(evidenceObs.periodEnd ?? evidenceObs.filedAt),
      actualValue: pct,
      threshold,
      evidence: metricEvidence(evidenceObs),
    });
  }

  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state: "UNKNOWN",
    explanation: "No share-count observation available",
    evidence: noneEvidence(
      "No MetricObservation for shares_outstanding or diluted_shares"
    ),
    threshold,
  });
}

function evaluateCapitalRiskNotAbove(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const maxStatus =
    typeof c.params.maxStatus === "string" ? c.params.maxStatus : null;
  if (!maxStatus || !isCapitalRiskStatus(maxStatus)) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Condition params are incomplete",
      evidence: noneEvidence("Invalid condition params"),
    });
  }

  const snap = ctx.capitalRisk;
  if (!snap) {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "No capital-risk snapshot available for this symbol",
      evidence: noneEvidence("No CapitalRiskSnapshot"),
    });
  }

  if (!isCapitalRiskStatus(snap.status) || snap.status === "unknown") {
    return baseResult(c, evaluatedAt, {
      mode: "automated",
      state: "UNKNOWN",
      explanation: "Capital-risk status is unknown",
      observationDate: snap.asOf.toISOString(),
      evidence: {
        sourceType: "capital_risk_snapshot",
        capitalRiskSnapshotId: snap.id,
        sourceId: snap.fingerprint,
        label: snap.summary || `Capital risk snapshot ${snap.status}`,
      },
    });
  }

  const exceeds = capitalRiskExceedsMax(snap.status, maxStatus);
  const state: ThesisConditionEvalState = exceeds ? "FAIL" : "PASS";

  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state,
    explanation: exceeds
      ? `Capital risk is ${snap.status}, which is above allowed max ${maxStatus}`
      : `Capital risk is ${snap.status} (allowed max ${maxStatus})`,
    observationDate: snap.asOf.toISOString(),
    evidence: {
      sourceType: "capital_risk_snapshot",
      capitalRiskSnapshotId: snap.id,
      sourceId: snap.fingerprint,
      label: snap.summary || `Capital risk ${snap.status}`,
    },
  });
}

function evaluateCashRunwayAbove(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const evaluatedAt = ctx.evaluatedAt.toISOString();
  const quarters = asNumber(c.params.quarters);
  return baseResult(c, evaluatedAt, {
    mode: "automated",
    state: "UNKNOWN",
    explanation:
      "Cash runway quarters are not produced by the financial metrics layer (burn model required)",
    threshold: quarters,
    evidence: engineEvidence("cash_runway_quarters unavailable"),
  });
}

function evaluateManual(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  return baseResult(c, ctx.evaluatedAt.toISOString(), {
    mode: "manual",
    state: null,
    explanation: "Manual condition — not auto-evaluated",
    evidence: engineEvidence("CUSTOM_MANUAL"),
  });
}

export function evaluateCondition(
  c: ThesisHealthConditionInput,
  ctx: ThesisHealthContext
): ThesisConditionHealthResult {
  const type = c.conditionType as ThesisConditionType;
  switch (type) {
    case "METRIC_ABOVE":
      return evaluateMetricLevel(c, ctx, "above");
    case "METRIC_BELOW":
      return evaluateMetricLevel(c, ctx, "below");
    case "METRIC_GROWTH_ABOVE":
      return evaluateMetricGrowth(c, ctx, "above");
    case "METRIC_GROWTH_BELOW":
      return evaluateMetricGrowth(c, ctx, "below");
    case "NO_EVENT_TYPE":
      return evaluateNoEventType(c, ctx);
    case "EVENT_TYPE_OCCURRED":
      return evaluateEventOccurred(c, ctx);
    case "SHARE_COUNT_CHANGE_BELOW":
      return evaluateShareCountChangeBelow(c, ctx);
    case "CAPITAL_RISK_NOT_ABOVE":
      return evaluateCapitalRiskNotAbove(c, ctx);
    case "CASH_RUNWAY_ABOVE":
      return evaluateCashRunwayAbove(c, ctx);
    case "CUSTOM_MANUAL":
      return evaluateManual(c, ctx);
    default:
      return baseResult(c, ctx.evaluatedAt.toISOString(), {
        mode: "automated",
        state: "UNKNOWN",
        explanation: `Unsupported condition type: ${String(type)}`,
        evidence: engineEvidence("Unsupported condition type"),
      });
  }
}

export function summarizeConditionResults(
  results: ThesisConditionHealthResult[]
): { summary: ThesisHealthSummaryCounts; healthStatus: ThesisHealthStatus } {
  const summary: ThesisHealthSummaryCounts = {
    passing: 0,
    warning: 0,
    failed: 0,
    unknown: 0,
    manual: 0,
  };

  for (const r of results) {
    if (r.mode === "manual") {
      summary.manual += 1;
      continue;
    }
    switch (r.state) {
      case "PASS":
        summary.passing += 1;
        break;
      case "WARN":
        summary.warning += 1;
        break;
      case "FAIL":
        summary.failed += 1;
        break;
      default:
        summary.unknown += 1;
        break;
    }
  }

  let healthStatus: ThesisHealthStatus = "unknown";
  if (summary.failed > 0) healthStatus = "broken";
  else if (summary.warning > 0) healthStatus = "watch";
  else if (summary.passing > 0 && summary.unknown === 0) healthStatus = "healthy";
  else if (summary.passing > 0) healthStatus = "watch";
  else healthStatus = "unknown";

  return { summary, healthStatus };
}

/**
 * Evaluate all conditions for a thesis against a prepared context.
 */
export function evaluateThesisHealth(opts: {
  conditions: ThesisHealthConditionInput[];
  context: ThesisHealthContext;
}): ThesisHealthEvaluationResult {
  const conditions = [...opts.conditions].map((c) =>
    evaluateCondition(c, opts.context)
  );
  const { summary, healthStatus } = summarizeConditionResults(conditions);
  const companyEventIds = [
    ...new Set(
      conditions
        .map((c) => c.evidence.companyEventId)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  return {
    version: THESIS_HEALTH_ENGINE_VERSION,
    evaluatedAt: opts.context.evaluatedAt.toISOString(),
    healthStatus,
    summary,
    conditions,
    companyEventIds,
    score: null,
  };
}

/** Exported for tests — capital registration WARN/FAIL rule. */
export { noEventBreachState, CAPITAL_REGISTRATION_EVENT_TYPES };
