/**
 * Transparent desk rating A–F from Judgment V2 + tape context.
 * Informational only — not a buy/sell signal.
 */

export type DeskLetter = "A" | "B" | "C" | "D" | "F";

export interface DeskRatingInput {
  catalystStrength?: string | null;
  directionalImplication?: string | null;
  reactionStage?: string | null;
  tradeability?: string | null;
  highRisk?: boolean;
  dilutionRisk?: boolean;
  changePercent?: number | null;
  floatShares?: number | null;
  hasJudgment?: boolean;
  catalystType?: string | null;
}

export interface DeskRating {
  letter: DeskLetter;
  score: number;
  label: string;
  why: string;
}

function strengthPts(s: string | null | undefined): number {
  switch ((s || "").toUpperCase()) {
    case "STRONG":
      return 35;
    case "MODERATE":
      return 22;
    case "WEAK":
      return 10;
    case "NOT_MATERIAL":
      return 0;
    default:
      return 12; // assume moderate-weak until classified
  }
}

function directionPts(d: string | null | undefined): number {
  switch ((d || "").toUpperCase()) {
    case "POSITIVE":
    case "NEGATIVE":
      return 20;
    case "MIXED":
      return 10;
    default:
      return 6;
  }
}

function stagePts(stage: string | null | undefined): number {
  switch ((stage || "").toUpperCase()) {
    case "EARLY":
      return 20;
    case "ACTIVE":
      return 14;
    case "EXTENDED":
      return 6;
    case "STALE":
      return 0;
    default:
      return 10;
  }
}

function tradePts(t: string | null | undefined): number {
  const u = (t || "").toUpperCase();
  if (u.includes("UNKNOWN") || u.includes("TBD") || !u.trim()) return 8;
  if (u.includes("TRADEABLE") || u.includes("OK") || u.includes("GOOD") || u.includes("ACCEPTABLE"))
    return 15;
  if (u.includes("CAUTION") || u.includes("THIN")) return 6;
  if (u.includes("AVOID") || u.includes("POOR") || u.includes("EXTREMELY")) return 0;
  return 8;
}

const LABELS: Record<DeskLetter, string> = {
  A: "Priority look",
  B: "Worth a look",
  C: "Monitor",
  D: "Low priority",
  F: "Skip / caution",
};

function letterFromScore(score: number): DeskLetter {
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  if (score >= 30) return "D";
  return "F";
}

/** Build a genuine letter grade with a one-line why — never "Unknown". */
export function computeDeskRating(input: DeskRatingInput): DeskRating {
  if (input.dilutionRisk || input.highRisk) {
    return {
      letter: "F",
      score: 15,
      label: LABELS.F,
      why: input.dilutionRisk
        ? "Dilution / offering risk flagged"
        : "Primary high-severity risk active",
    };
  }

  let score =
    strengthPts(input.catalystStrength) +
    directionPts(input.directionalImplication) +
    stagePts(input.reactionStage) +
    tradePts(input.tradeability);

  const absMove = Math.abs(input.changePercent ?? 0);
  if (absMove >= 2 && absMove < 10) score += 5;
  if (absMove >= 12) score -= 8;

  const floatM = (input.floatShares ?? 0) / 1e6;
  if (floatM > 0 && floatM < 20) score += 5;
  if (floatM > 500) score -= 3;

  const type = (input.catalystType || "").toLowerCase();
  if (["fda", "offering", "earnings", "contract", "merger"].includes(type)) {
    score += 4;
  }

  score = Math.max(0, Math.min(100, score));
  const letter = letterFromScore(score);

  const strength = (input.catalystStrength || "").toUpperCase();
  const stage = (input.reactionStage || "").toLowerCase() || "forming";
  let why: string;
  if (strength === "STRONG") why = `Strong catalyst · ${stage} tape`;
  else if (strength === "MODERATE") why = `Moderate catalyst · ${stage} tape`;
  else if (strength === "WEAK") why = `Weak catalyst · ${stage} tape`;
  else if (strength === "NOT_MATERIAL") why = "Likely not material for a day trade";
  else if (absMove >= 2) why = `Live move ${absMove.toFixed(1)}% · ${stage} tape`;
  else why = `Desk score ${score}/100 · ${stage} tape`;

  return {
    letter,
    score,
    label: LABELS[letter],
    why,
  };
}

export function deskRatingBadgeClass(letter: DeskLetter | string): string {
  switch (letter) {
    case "A":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
    case "B":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
    case "C":
      return "border-zinc-500/40 bg-zinc-500/10 text-zinc-300";
    case "D":
      return "border-amber-500/35 bg-amber-500/10 text-amber-200";
    case "F":
      return "border-red-500/40 bg-red-500/10 text-red-200";
    default:
      return "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]";
  }
}
