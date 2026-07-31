/**
 * Transparent desk rating A–F from Judgment V2 + tape context.
 * Informational only — not a buy/sell signal.
 */

export type DeskLetter = "A" | "B" | "C" | "D" | "F" | "?";

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
      return 8;
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
      return 4;
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
      return 8;
  }
}

function tradePts(t: string | null | undefined): number {
  const u = (t || "").toUpperCase();
  if (u.includes("TRADEABLE") || u.includes("OK") || u.includes("GOOD")) return 15;
  if (u.includes("CAUTION") || u.includes("THIN")) return 6;
  if (u.includes("AVOID") || u.includes("POOR")) return 0;
  return 8;
}

/** Build a genuine letter grade with a one-line why. */
export function computeDeskRating(input: DeskRatingInput): DeskRating {
  if (input.dilutionRisk || input.highRisk) {
    return {
      letter: "F",
      score: 15,
      label: "High risk",
      why: input.dilutionRisk
        ? "Dilution / offering risk flagged"
        : "Primary high-severity risk active",
    };
  }

  if (!input.hasJudgment && input.catalystStrength == null) {
    return {
      letter: "?",
      score: 0,
      label: "Pending",
      why: "Desk read still forming — check source",
    };
  }

  let score =
    strengthPts(input.catalystStrength) +
    directionPts(input.directionalImplication) +
    stagePts(input.reactionStage) +
    tradePts(input.tradeability);

  const absMove = Math.abs(input.changePercent ?? 0);
  if (absMove >= 2 && absMove < 10) score += 5;
  if (absMove >= 12) score -= 8; // already extended

  const floatM = (input.floatShares ?? 0) / 1e6;
  if (floatM > 0 && floatM < 20) score += 5; // small float can matter for day trades
  if (floatM > 500) score -= 3;

  score = Math.max(0, Math.min(100, score));

  let letter: DeskLetter;
  if (score >= 75) letter = "A";
  else if (score >= 60) letter = "B";
  else if (score >= 45) letter = "C";
  else if (score >= 30) letter = "D";
  else letter = "F";

  const labels: Record<DeskLetter, string> = {
    A: "Priority look",
    B: "Worth a look",
    C: "Monitor",
    D: "Low priority",
    F: "Skip / caution",
    "?": "Pending",
  };

  const bits: string[] = [];
  if (input.catalystStrength)
    bits.push(`Materiality ${input.catalystStrength.toLowerCase().replace(/_/g, " ")}`);
  if (input.reactionStage) bits.push(`Stage ${input.reactionStage}`);
  if (input.directionalImplication)
    bits.push(`Dir ${input.directionalImplication.toLowerCase()}`);

  return {
    letter,
    score,
    label: labels[letter],
    why: bits.slice(0, 2).join(" · ") || "Based on materiality, stage, and risk",
  };
}

export function deskRatingBadgeClass(letter: DeskLetter): string {
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
