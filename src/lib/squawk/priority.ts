import type { SquawkPriorityLevel } from "./types.ts";
import { PRIORITY_RANK } from "./types.ts";

export interface PriorityInput {
  urgencyScore?: number | null;
  verifiedConfidence?: number | null;
  riskSeverity?: "high" | "medium" | "low" | null;
  onWatchlist?: boolean;
  isRiskCatalyst?: boolean;
  absMovePct?: number | null;
  rVol?: number | null;
  grade?: string | null;
}

export function computeSquawkPriority(input: PriorityInput): {
  level: SquawkPriorityLevel;
  score: number;
} {
  let score = 40;
  if (input.onWatchlist) score += 20;
  if (input.isRiskCatalyst) score += 15;
  if (input.riskSeverity === "high") score += 25;
  else if (input.riskSeverity === "medium") score += 10;
  if ((input.verifiedConfidence ?? 0) >= 70) score += 10;
  if ((input.urgencyScore ?? 0) >= 70) score += 15;
  else if ((input.urgencyScore ?? 0) >= 40) score += 5;
  if ((input.absMovePct ?? 0) >= 8) score += 10;
  if ((input.rVol ?? 0) >= 5) score += 8;
  if (input.grade === "go" || input.grade === "GO") score += 8;
  if (
    (input.grade === "skip" || input.grade === "SKIP") &&
    input.isRiskCatalyst
  ) {
    score += 5;
  }

  let level: SquawkPriorityLevel = "low";
  if (score >= 90) level = "critical";
  else if (score >= 70) level = "high";
  else if (score >= 50) level = "normal";

  return { level, score };
}

export function meetsMinPriority(
  level: SquawkPriorityLevel,
  min: SquawkPriorityLevel
): boolean {
  return PRIORITY_RANK[level] >= PRIORITY_RANK[min];
}

/**
 * Interrupt only when incoming priority is strictly higher than current.
 */
export function shouldInterrupt(
  current: SquawkPriorityLevel | null,
  incoming: SquawkPriorityLevel
): boolean {
  if (!current) return true;
  return PRIORITY_RANK[incoming] > PRIORITY_RANK[current];
}
