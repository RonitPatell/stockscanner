/**
 * Pure public readiness projection — safe for Node tests (no @/ imports).
 */

import type {
  MarketReadinessInternal,
  PublicMarketReadiness,
} from "./market-readiness-types.ts";

export type { MarketReadinessInternal, PublicMarketReadiness };

/** Strip internal ages / ids for public `/api/health` consumers. */
export function toPublicMarketReadiness(
  internal: MarketReadinessInternal
): PublicMarketReadiness {
  return {
    ready: internal.ready,
    status: internal.status,
    session: internal.session,
    checks: { ...internal.checks },
  };
}
