/**
 * Capital risk status ordering for CAPITAL_RISK_NOT_ABOVE.
 */

import type { CapitalRiskStatusLevel } from "../types.ts";

const RANK: Record<string, number> = {
  unknown: 0,
  low: 1,
  moderate: 2,
  elevated: 3,
};

export function capitalRiskRank(status: string): number {
  return RANK[status] ?? 0;
}

export function isCapitalRiskStatus(v: string): v is CapitalRiskStatusLevel {
  return v in RANK;
}

/** True when observed status is strictly above the allowed ceiling. */
export function capitalRiskExceedsMax(
  status: string,
  maxStatus: string
): boolean {
  return capitalRiskRank(status) > capitalRiskRank(maxStatus);
}
