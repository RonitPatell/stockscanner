/**
 * Dynamic catalyst coverage — transparent reasons, temporary TTLs.
 * Honest about what we can and cannot see (no fabricated halt feed).
 */

export const COVERAGE_REASONS = [
  "USER_WATCHLIST",
  "CURATED_CORE",
  "ACTIVE_GAINER",
  "UNUSUAL_VOLUME",
  "RECENT_HALT",
  "FRESH_SEC_FILING",
  "FRESH_NEWS",
  "MANUAL",
] as const;

export type CoverageReason = (typeof COVERAGE_REASONS)[number];

export function isCoverageReason(v: string): v is CoverageReason {
  return (COVERAGE_REASONS as readonly string[]).includes(v);
}

/** Temporary coverage TTL hours (overridable via env). */
export function coverageTtlHours(reason: CoverageReason): number {
  const envKey = `COVERAGE_TTL_H_${reason}`;
  const fromEnv = Number(process.env[envKey]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  switch (reason) {
    case "USER_WATCHLIST":
    case "CURATED_CORE":
    case "MANUAL":
      return 0; // permanent until removed
    case "ACTIVE_GAINER":
      return Number(process.env.COVERAGE_TTL_H_ACTIVE_GAINER) || 6;
    case "UNUSUAL_VOLUME":
      return Number(process.env.COVERAGE_TTL_H_UNUSUAL_VOLUME) || 8;
    case "RECENT_HALT":
      return Number(process.env.COVERAGE_TTL_H_RECENT_HALT) || 24;
    case "FRESH_SEC_FILING":
      return Number(process.env.COVERAGE_TTL_H_FRESH_SEC_FILING) || 48;
    case "FRESH_NEWS":
      return Number(process.env.COVERAGE_TTL_H_FRESH_NEWS) || 12;
    default:
      return 12;
  }
}

export function isTemporaryReason(reason: CoverageReason): boolean {
  return coverageTtlHours(reason) > 0;
}

export const COVERAGE_REASON_LABELS: Record<CoverageReason, string> = {
  USER_WATCHLIST: "Your watchlist",
  CURATED_CORE: "Curated core",
  ACTIVE_GAINER: "Active gainer",
  UNUSUAL_VOLUME: "Unusual volume",
  RECENT_HALT: "Recent halt (news)",
  FRESH_SEC_FILING: "Fresh SEC filing",
  FRESH_NEWS: "Fresh news",
  MANUAL: "Manual",
};

export const COVERAGE_REASON_HINTS: Record<CoverageReason, string> = {
  USER_WATCHLIST: "You added this symbol — always polled for your alerts.",
  CURATED_CORE: "Always-on liquid names we rotate for breadth (not the whole market).",
  ACTIVE_GAINER: "Temporary: significant % move in our scanner sample.",
  UNUSUAL_VOLUME: "Temporary: elevated relative volume in our quote sample.",
  RECENT_HALT:
    "Temporary: headline mentioned a trading halt. We do not have an exchange halt feed.",
  FRESH_SEC_FILING: "Temporary: recent EDGAR filing mapped to this ticker.",
  FRESH_NEWS: "Temporary: high-confidence news match outside the curated core.",
  MANUAL: "Added by an operator.",
};

/** Match confidence floors — below publish floor → quarantine (no live alert). */
export const MATCH_PUBLISH_FLOOR = Number(process.env.MATCH_PUBLISH_FLOOR) || 45;
export const MATCH_QUARANTINE_FLOOR = Number(process.env.MATCH_QUARANTINE_FLOOR) || 10;

export type AlertMode = "EARLY" | "CONFIRMED" | "RISK_ONLY";

export const ALERT_MODES: AlertMode[] = ["EARLY", "CONFIRMED", "RISK_ONLY"];

export function isAlertMode(v: string): v is AlertMode {
  return (ALERT_MODES as readonly string[]).includes(v);
}
