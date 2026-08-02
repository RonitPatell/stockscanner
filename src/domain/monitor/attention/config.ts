import type { SessionSegment } from "../market-state/session.ts";
import type { LeaderSelectionConfig } from "./types.ts";

export const DEFAULT_LEADER_CONFIG: LeaderSelectionConfig = {
  challengeMargin: 5,
  challengeHoldMs: 3_000,
  minLeaderHoldMs: 5_000,
  staleLeaderMs: 15_000,
  staleScoreMs: 5_000,
};

/** Session multipliers on momentum / catalyst freshness (inspection urgency). */
export function sessionAttentionMult(segment: SessionSegment): number {
  switch (segment) {
    case "open_auction":
      return 1.12;
    case "regular":
      return 1.0;
    case "premarket":
      return 0.95;
    case "after_hours":
      return 0.9;
    case "closed":
      return 0.7;
    default:
      return 1;
  }
}

export function mergeLeaderConfig(
  over?: Partial<LeaderSelectionConfig>
): LeaderSelectionConfig {
  return { ...DEFAULT_LEADER_CONFIG, ...(over ?? {}) };
}

export function clamp100(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 10) / 10;
}

export function tierFromPriority(p: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  if (p >= 85) return "CRITICAL";
  if (p >= 65) return "HIGH";
  if (p >= 35) return "MEDIUM";
  return "LOW";
}
