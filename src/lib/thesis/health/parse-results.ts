/**
 * Map persisted ThesisEvaluation.resultsJson → per-condition evaluation DTOs.
 */

import type {
  ThesisConditionEvalState,
  ThesisConditionEvaluationDto,
  ThesisConditionEvidenceDto,
  ThesisHealthSummaryDto,
} from "../types.ts";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function asEvidence(v: unknown): ThesisConditionEvidenceDto | undefined {
  const r = asRecord(v);
  if (typeof r.label !== "string") return undefined;
  return {
    sourceType: typeof r.sourceType === "string" ? r.sourceType : "none",
    sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : null,
    sourceId: typeof r.sourceId === "string" ? r.sourceId : null,
    accession: typeof r.accession === "string" ? r.accession : null,
    metricFingerprint:
      typeof r.metricFingerprint === "string" ? r.metricFingerprint : null,
    companyEventId:
      typeof r.companyEventId === "string" ? r.companyEventId : null,
    capitalRiskSnapshotId:
      typeof r.capitalRiskSnapshotId === "string"
        ? r.capitalRiskSnapshotId
        : null,
    label: r.label,
  };
}

export function parseHealthResultsJson(raw: unknown): {
  byConditionId: Map<string, ThesisConditionEvaluationDto>;
  summary: ThesisHealthSummaryDto | null;
  evaluatedAt: string | null;
  healthStatus: string | null;
} {
  const root = asRecord(raw);
  const byConditionId = new Map<string, ThesisConditionEvaluationDto>();
  const conditions = Array.isArray(root.conditions) ? root.conditions : [];
  let evaluatedAt: string | null =
    typeof root.evaluatedAt === "string" ? root.evaluatedAt : null;

  for (const item of conditions) {
    const r = asRecord(item);
    const id = typeof r.conditionId === "string" ? r.conditionId : null;
    if (!id) continue;
    if (typeof r.evaluatedAt === "string" && !evaluatedAt) {
      evaluatedAt = r.evaluatedAt;
    }
    if (r.mode === "manual") {
      byConditionId.set(id, {
        mode: "manual",
        state: null,
        explanation:
          typeof r.explanation === "string" ? r.explanation : undefined,
        evidence: asEvidence(r.evidence),
        evaluatedAt:
          typeof r.evaluatedAt === "string" ? r.evaluatedAt : undefined,
      });
      continue;
    }
    const state =
      r.state === "PASS" ||
      r.state === "WARN" ||
      r.state === "FAIL" ||
      r.state === "UNKNOWN"
        ? (r.state as ThesisConditionEvalState)
        : "UNKNOWN";
    byConditionId.set(id, {
      mode: "automated",
      state,
      explanation:
        typeof r.explanation === "string" ? r.explanation : undefined,
      observationDate:
        typeof r.observationDate === "string" || r.observationDate === null
          ? (r.observationDate as string | null)
          : undefined,
      actualValue:
        typeof r.actualValue === "number" && Number.isFinite(r.actualValue)
          ? r.actualValue
          : r.actualValue === null
            ? null
            : undefined,
      threshold:
        typeof r.threshold === "number" && Number.isFinite(r.threshold)
          ? r.threshold
          : r.threshold === null
            ? null
            : undefined,
      evidence: asEvidence(r.evidence),
      evaluatedAt:
        typeof r.evaluatedAt === "string" ? r.evaluatedAt : undefined,
    });
  }

  const summaryRaw = asRecord(root.summary);
  const summary: ThesisHealthSummaryDto | null =
    typeof summaryRaw.passing === "number"
      ? {
          passing: Number(summaryRaw.passing) || 0,
          warning: Number(summaryRaw.warning) || 0,
          failed: Number(summaryRaw.failed) || 0,
          unknown: Number(summaryRaw.unknown) || 0,
          manual: Number(summaryRaw.manual) || 0,
        }
      : null;

  return {
    byConditionId,
    summary,
    evaluatedAt,
    healthStatus:
      typeof root.healthStatus === "string" ? root.healthStatus : null,
  };
}
