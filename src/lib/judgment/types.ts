/**
 * Judgment V2 — auditable catalyst classification.
 * Never a personalized recommendation; versioned for reproducibility.
 */

export const JUDGMENT_V2_VERSION = "judgment-v2.0";

export type CatalystStrength = "STRONG" | "MODERATE" | "WEAK" | "NOT_MATERIAL";
export type DirectionalImplication = "POSITIVE" | "NEGATIVE" | "MIXED" | "UNCLEAR";
export type JudgmentTiming = "IMMEDIATE" | "TODAY" | "SCHEDULED" | "STALE";
export type Tradeability = "LIQUID" | "ACCEPTABLE" | "THIN" | "EXTREMELY_THIN";
export type JudgmentConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TradeGrade = "go" | "watch" | "skip";

export type ScoreCategory = "fact" | "interpretation" | "uncertainty" | "risk";

export interface ScoreContribution {
  id: string;
  label: string;
  /** Signed contribution toward overall materiality/direction score */
  points: number;
  category: ScoreCategory;
  detail: string;
}

export interface RiskFlag {
  id: string;
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

export interface JudgmentChangeEntry {
  at: string;
  reason: string;
  previousGrade?: TradeGrade;
  previousVersion?: string;
}

export interface JudgmentV2 {
  version: typeof JUDGMENT_V2_VERSION | string;
  classifiedAt: string;

  /** Verified facts (observable / sourced) — not opinions */
  verifiedFacts: string[];
  /** Automated interpretation — labeled as machine-derived */
  automatedInterpretation: string[];
  /** Explicit gaps */
  missingOrUncertain: string[];

  catalystStrength: CatalystStrength;
  directionalImplication: DirectionalImplication;
  timing: JudgmentTiming;
  tradeability: Tradeability;
  confidence: JudgmentConfidence;

  riskFlags: RiskFlag[];
  scoreContributions: ScoreContribution[];

  /** Compatible desk grade derived from V2 axes */
  grade: TradeGrade;
  gradeLabel: string;
  gradeRationale: string;

  source?: string | null;
  sourceUrl?: string | null;
  sourceTier?: string | null;

  /** Always shown — not personalized advice */
  disclaimer: string;

  changeLog: JudgmentChangeEntry[];
}

export const JUDGMENT_FEEDBACK_ACTIONS = [
  "correct_ticker",
  "wrong_category",
  "duplicate",
  "stale",
  "material",
  "not_material",
  "missing_risk",
] as const;

export type JudgmentFeedbackAction = (typeof JUDGMENT_FEEDBACK_ACTIONS)[number];

export function isJudgmentFeedbackAction(v: string): v is JudgmentFeedbackAction {
  return (JUDGMENT_FEEDBACK_ACTIONS as readonly string[]).includes(v);
}

export const JUDGMENT_FEEDBACK_LABELS: Record<JudgmentFeedbackAction, string> = {
  correct_ticker: "Wrong ticker — suggest correction",
  wrong_category: "Wrong category / type",
  duplicate: "Duplicate story",
  stale: "Stale / already known",
  material: "This is material",
  not_material: "Not material",
  missing_risk: "Missing risk flag",
};

/** Feature flag — default off until operators enable. */
export function isJudgmentV2Enabled(): boolean {
  const raw = process.env.JUDGMENT_V2_ENABLED ?? process.env.NEXT_PUBLIC_JUDGMENT_V2_ENABLED;
  if (raw == null || raw.trim() === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
