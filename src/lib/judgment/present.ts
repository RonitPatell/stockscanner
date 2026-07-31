/**
 * Judgment presentation adapter.
 *
 * Translates stored Judgment V2 / Decision Card / reaction enums into five
 * informational dimensions. Does not change classification, invent recommendations,
 * or expose GO / LONG / SHORT / SKIP as primary action labels.
 */

import type {
  CatalystStrength,
  DirectionalImplication,
  JudgmentV2,
  RiskFlag,
  TradeGrade,
  Tradeability,
} from "./types.ts";
import type { ReactionStage } from "../decision-card/types.ts";

export const JUDGMENT_PRESENTATION_VERSION = "judgment-present-v1";

export type MaterialityLabel =
  | "High"
  | "Medium"
  | "Low"
  | "Not material"
  | "Unknown";
export type DirectionLabel =
  | "Positive"
  | "Negative"
  | "Mixed"
  | "No clear bias";
export type ReactionStageLabel =
  | "Early"
  | "Active"
  | "Extended"
  | "Stale"
  | "Unknown";
export type TradeabilityLabel =
  | "Liquid"
  | "Acceptable"
  | "Thin"
  | "Extremely thin"
  | "Liquidity TBD";

export interface JudgmentPresentation {
  version: typeof JUDGMENT_PRESENTATION_VERSION;
  materiality: MaterialityLabel;
  direction: DirectionLabel;
  reactionStage: ReactionStageLabel;
  tradeability: TradeabilityLabel;
  topRisk: string | null;
  /** Explicit note: direction ≠ review priority ≠ trade instruction */
  separationNote: string;
  /** Compact one-line for alerts / squawk / context rows */
  dimensionsLine: string;
  /** Accessible label combining all five dimensions */
  ariaLabel: string;
  /** Legacy grade kept for DB/API compatibility — never primary UI */
  legacyGrade: TradeGrade | null;
  /** Review urgency derived from legacy grade — informational only */
  reviewPriority: "Immediate review" | "Monitor" | "Low priority" | null;
}

export const JUDGMENT_SEPARATION_NOTE =
  "Materiality is whether the event warrants attention. Direction is catalyst implication only — not a buy or sell instruction.";

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Map Judgment V2 catalystStrength → Materiality. */
export function presentMateriality(
  strength: CatalystStrength | string | null | undefined
): MaterialityLabel {
  switch (strength) {
    case "STRONG":
      return "High";
    case "MODERATE":
      return "Medium";
    case "WEAK":
      return "Low";
    case "NOT_MATERIAL":
      return "Not material";
    default:
      // Prefer a readable default over "Unknown" on the desk
      return "Low";
  }
}

/** Map directionalImplication → display direction. */
export function presentDirection(
  d: DirectionalImplication | string | null | undefined
): DirectionLabel {
  switch (d) {
    case "POSITIVE":
    case "Positive":
      return "Positive";
    case "NEGATIVE":
    case "Negative":
      return "Negative";
    case "MIXED":
    case "Mixed":
      return "Mixed";
    case "UNCLEAR":
    case "Unclear":
      return "No clear bias";
    default:
      return "No clear bias";
  }
}

const BULL_TYPES = new Set([
  "fda",
  "contract",
  "earnings",
  "upgrade",
  "partnership",
  "buyback",
  "merger",
]);
const BEAR_TYPES = new Set([
  "downgrade",
  "lawsuit",
  "investigation",
  "bankruptcy",
  "offering",
  "dilution",
]);

const HEADLINE_BULL_RE =
  /\b(approv(?:ed|al)|clearance|award(?:ed)?|wins?\b|contract|partnership|beats?|raises?\s+guidance|buyback|acquisition|merger|upgrade|positive\s+data|breakthrough)\b/i;
const HEADLINE_BEAR_RE =
  /\b(offering|dilution|at[- ]the[- ]market|\batm\b|registered\s+direct|prospectus|lawsuit|investigation|misses?|cuts?\s+guidance|bankruptcy|downgrade|delist|reverse\s+split|warrant)\b/i;

/**
 * Infer catalyst direction from type / sentiment / headline when Judgment V2
 * is missing or stored as UNCLEAR. Presentation only — not a trade signal.
 */
export function inferDirectionalImplication(c: {
  catalystType?: string | null;
  sentimentScore?: number | null;
  sentimentLabel?: string | null;
  headline?: string | null;
  aiSummary?: string | null;
  setupTags?: string[] | null;
}): DirectionalImplication {
  const type = (c.catalystType ?? "").toLowerCase();
  const label = (c.sentimentLabel ?? "").toLowerCase();
  const text = `${c.headline ?? ""} ${c.aiSummary ?? ""}`;
  const dilutionHint =
    type === "offering" ||
    type === "dilution" ||
    /\b(offering|dilution|atm|registered\s+direct|prospectus)\b/i.test(text) ||
    Boolean(c.setupTags?.some((t) => /dilution|offering/i.test(t)));

  const bullHeadline = HEADLINE_BULL_RE.test(text);
  const bearHeadline = HEADLINE_BEAR_RE.test(text);

  if (dilutionHint && (bullHeadline || BULL_TYPES.has(type) || (c.sentimentScore ?? 0) >= 20)) {
    return "MIXED";
  }
  if (dilutionHint || BEAR_TYPES.has(type) || bearHeadline) {
    if (bullHeadline && !dilutionHint) return "MIXED";
    return "NEGATIVE";
  }
  if (BULL_TYPES.has(type) || bullHeadline) return "POSITIVE";

  if (label.includes("bull")) return "POSITIVE";
  if (label.includes("bear")) return "NEGATIVE";
  if (label.includes("mixed")) return "MIXED";

  const s = c.sentimentScore;
  if (s != null) {
    if (s >= 15) return "POSITIVE";
    if (s <= -15) return "NEGATIVE";
  }
  return "UNCLEAR";
}

/**
 * Reaction stage from Decision Card engine, Judgment timing, or unknown.
 * Presentation only — does not recompute stage rules.
 */
export function presentReactionStage(
  stage:
    | ReactionStage
    | "EARLY"
    | "ACTIVE"
    | "EXTENDED"
    | "STALE"
    | "UNKNOWN"
    | string
    | null
    | undefined,
  timingFallback?: string | null
): ReactionStageLabel {
  const s = (stage ?? "").toUpperCase();
  if (s === "EARLY") return "Early";
  if (s === "ACTIVE") return "Active";
  if (s === "EXTENDED") return "Extended";
  if (s === "STALE") return "Stale";
  if (s === "UNKNOWN" || s === "") {
    const t = (timingFallback ?? "").toUpperCase();
    if (t === "IMMEDIATE" || t === "TODAY") return "Active";
    if (t === "SCHEDULED") return "Early";
    if (t === "STALE") return "Stale";
    return "Unknown";
  }
  return "Unknown";
}

export function presentTradeability(
  t: Tradeability | string | null | undefined
): TradeabilityLabel {
  switch (t) {
    case "LIQUID":
      return "Liquid";
    case "ACCEPTABLE":
      return "Acceptable";
    case "THIN":
      return "Thin";
    case "EXTREMELY_THIN":
      return "Extremely thin";
    case "UNKNOWN":
    case "UNAVAILABLE":
    case null:
    case undefined:
    case "":
      return "Liquidity TBD";
    default:
      return "Liquidity TBD";
  }
}

export function presentTopRisk(
  flags: RiskFlag[] | null | undefined,
  extras?: { dilutionHint?: boolean; haltHint?: boolean; fallback?: string | null }
): string | null {
  const list = [...(flags ?? [])].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
  );
  if (list[0]?.label) return list[0].label;
  if (extras?.dilutionHint) return "Dilution / offering risk";
  if (extras?.haltHint) return "Halt risk";
  if (extras?.fallback) return extras.fallback;
  return null;
}

/** Legacy GO/WATCH/SKIP → review priority text (never buy/sell). */
export function presentReviewPriority(
  grade: TradeGrade | string | null | undefined
): JudgmentPresentation["reviewPriority"] {
  if (grade === "go") return "Immediate review";
  if (grade === "watch") return "Monitor";
  if (grade === "skip") return "Low priority";
  return null;
}

export function presentSessionBias(
  bias: string | null | undefined
): { direction: DirectionLabel; reviewLabel: string } {
  const b = (bias ?? "").toLowerCase();
  if (b === "long") {
    return { direction: "Positive", reviewLabel: "Review candidate" };
  }
  if (b === "short") {
    return { direction: "Negative", reviewLabel: "Review candidate" };
  }
  if (b === "avoid") {
    return { direction: "No clear bias", reviewLabel: "Capital caution" };
  }
  return { direction: "No clear bias", reviewLabel: "Monitor" };
}

export interface PresentJudgmentInput {
  judgment?: JudgmentV2 | null;
  /** Decision Card / feed reaction stage override */
  reactionStage?: string | null;
  /** Decision Card liquidity override */
  tradeability?: string | null;
  dilutionHint?: boolean;
  haltHint?: boolean;
  /** When judgment missing — optional strength/direction fragments */
  catalystStrength?: CatalystStrength | string | null;
  directionalImplication?: DirectionalImplication | string | null;
  timing?: string | null;
  riskFlags?: RiskFlag[] | null;
  legacyGrade?: TradeGrade | string | null;
}

/**
 * Single adapter: five informational dimensions from stored classification.
 */
export function presentJudgment(input: PresentJudgmentInput = {}): JudgmentPresentation {
  const j = input.judgment ?? null;
  const materiality = presentMateriality(
    j?.catalystStrength ?? input.catalystStrength
  );
  // Treat stored UNCLEAR as missing so type/sentiment fallbacks can fill in
  const storedDir = j?.directionalImplication;
  const direction = presentDirection(
    storedDir && storedDir !== "UNCLEAR"
      ? storedDir
      : (input.directionalImplication ?? storedDir)
  );
  const reactionStage = presentReactionStage(
    input.reactionStage,
    j?.timing ?? input.timing
  );
  const tradeability = presentTradeability(
    input.tradeability ?? j?.tradeability
  );
  const topRisk = presentTopRisk(j?.riskFlags ?? input.riskFlags, {
    dilutionHint: input.dilutionHint,
    haltHint: input.haltHint,
  });
  const legacyGrade =
    (j?.grade as TradeGrade | undefined) ??
    (input.legacyGrade as TradeGrade | null | undefined) ??
    null;
  const reviewPriority = presentReviewPriority(legacyGrade);

  const riskPart = topRisk ?? "No major capital risk";
  const dimensionsLine = [
    `Materiality ${materiality}`,
    `Direction ${direction}`,
    `Reaction ${reactionStage}`,
    `Tradeability ${tradeability}`,
    riskPart,
  ].join(" · ");

  const ariaLabel = [
    `Materiality: ${materiality}`,
    `Directional implication: ${direction}`,
    `Reaction stage: ${reactionStage}`,
    `Tradeability: ${tradeability}`,
    `Risk: ${riskPart}`,
  ].join(". ");

  return {
    version: JUDGMENT_PRESENTATION_VERSION,
    materiality,
    direction,
    reactionStage,
    tradeability,
    topRisk,
    separationNote: JUDGMENT_SEPARATION_NOTE,
    dimensionsLine,
    ariaLabel,
    legacyGrade,
    reviewPriority,
  };
}

/** Tone helpers for UI — pair with text/icons; never colour alone. */
export function directionTone(
  d: DirectionLabel
): "pos" | "neg" | "warn" | "neutral" {
  if (d === "Positive") return "pos";
  if (d === "Negative") return "neg";
  if (d === "Mixed") return "warn";
  return "neutral";
}

export function materialityTone(
  m: MaterialityLabel
): "pos" | "warn" | "neutral" {
  if (m === "High") return "pos";
  if (m === "Medium") return "warn";
  return "neutral";
}

export function tradeabilityTone(
  t: TradeabilityLabel
): "warn" | "neutral" {
  if (t === "Thin" || t === "Extremely thin" || t === "Liquidity TBD") return "warn";
  return "neutral";
}

/** Assert presentation never claims buy/sell (for tests + call-site checks). */
export function presentationLooksLikeTradeInstruction(text: string): boolean {
  // Allow explicit disclaimers like "not a buy or sell instruction"
  if (/\bnot\s+(a\s+)?(buy|sell|personalized)/i.test(text)) return false;
  if (/\b≠\s*buy/i.test(text)) return false;
  return /\b(buy|sell|go long|go short|enter long|enter short|long bias|short bias)\b/i.test(
    text
  );
}
