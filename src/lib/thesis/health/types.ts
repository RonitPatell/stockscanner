/**
 * Thesis Health evaluation types — PASS/WARN/FAIL/UNKNOWN only.
 * Not portfolio advice. No single "stock score".
 */

import type {
  CapitalRiskStatusLevel,
  ThesisConditionEvalState,
  ThesisConditionPolarity,
  ThesisConditionType,
  ThesisHealthStatus,
} from "../types.ts";

export const THESIS_HEALTH_ENGINE_VERSION = "1.0.0";

export type ThesisHealthEvidence = {
  /** Where the observation came from. */
  sourceType:
    | "metric_observation"
    | "company_event"
    | "capital_risk_snapshot"
    | "engine"
    | "none";
  sourceUrl?: string | null;
  sourceId?: string | null;
  accession?: string | null;
  metricFingerprint?: string | null;
  companyEventId?: string | null;
  capitalRiskSnapshotId?: string | null;
  /** Short factual label for UI. */
  label: string;
};

export type ThesisConditionHealthResult = {
  conditionId: string;
  conditionType: ThesisConditionType;
  label: string;
  polarity: ThesisConditionPolarity;
  state: ThesisConditionEvalState | null;
  /** Manual conditions are not auto-scored. */
  mode: "automated" | "manual";
  explanation: string;
  observationDate: string | null;
  actualValue: number | null;
  threshold: number | null;
  evidence: ThesisHealthEvidence;
  evaluatedAt: string;
};

export type ThesisHealthSummaryCounts = {
  passing: number;
  warning: number;
  failed: number;
  unknown: number;
  /** CUSTOM_MANUAL rows — excluded from automated counts. */
  manual: number;
};

export type ThesisHealthEvaluationResult = {
  version: string;
  evaluatedAt: string;
  healthStatus: ThesisHealthStatus;
  summary: ThesisHealthSummaryCounts;
  conditions: ThesisConditionHealthResult[];
  /** Company event ids referenced in evidence (for ThesisEvaluation.companyEventIds). */
  companyEventIds: string[];
  /** Always null — we do not publish a deceptive composite score. */
  score: null;
};

export type ThesisHealthConditionInput = {
  id: string;
  conditionType: ThesisConditionType;
  label: string;
  polarity: ThesisConditionPolarity;
  params: Record<string, unknown>;
};

export type ThesisHealthMetricObservation = {
  metricKey: string;
  value: number | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  periodLabel: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  filedAt: Date | null;
  accession: string | null;
  sourceUrl: string | null;
  fingerprint: string;
  unit: string | null;
  confidence: string;
  sourceType: string;
  secConcept: string | null;
  evidence: Record<string, unknown>;
};

export type ThesisHealthCompanyEvent = {
  id: string;
  eventType: string;
  title: string;
  occurredAt: Date;
  sourceUrl: string | null;
  sourceId: string | null;
  severity: string;
  category: string;
};

export type ThesisHealthCapitalSnapshot = {
  id: string;
  status: CapitalRiskStatusLevel | string;
  asOf: Date;
  summary: string | null;
  fingerprint: string;
} | null;

export type ThesisHealthContext = {
  symbol: string;
  thesisCreatedAt: Date;
  /** When evaluation runs. */
  evaluatedAt: Date;
  observations: ThesisHealthMetricObservation[];
  events: ThesisHealthCompanyEvent[];
  capitalRisk: ThesisHealthCapitalSnapshot;
};
