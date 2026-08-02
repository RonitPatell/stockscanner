/**
 * Expansion gates — must all be satisfied before advancing a cohort stage.
 * These are operational attestations, not measured SLAs.
 */

export const MONITOR_EXPANSION_GATES = [
  "no_p0_security",
  "no_cross_user_isolation_failures",
  "acceptable_provider_health",
  "no_unresolved_migrations",
  "no_major_leader_flapping",
  "no_stale_data_as_live",
  "no_severe_browser_perf_regression",
  "support_docs_updated",
  "platform_guide_updated",
] as const;

export type MonitorExpansionGateId = (typeof MONITOR_EXPANSION_GATES)[number];

export const MONITOR_EXPANSION_GATE_LABELS: Record<
  MonitorExpansionGateId,
  string
> = {
  no_p0_security: "No P0 security findings",
  no_cross_user_isolation_failures: "No cross-user isolation failures",
  acceptable_provider_health: "Acceptable provider health",
  no_unresolved_migrations: "No unresolved migration issues",
  no_major_leader_flapping: "No major leader-flapping defect",
  no_stale_data_as_live: "No stale-data-as-live defect",
  no_severe_browser_perf_regression: "No severe browser performance regression",
  support_docs_updated: "Support documentation updated",
  platform_guide_updated: "Platform Guide updated",
};

export type ExpansionGateState = Record<MonitorExpansionGateId, boolean>;

export function emptyExpansionGates(): ExpansionGateState {
  return {
    no_p0_security: false,
    no_cross_user_isolation_failures: false,
    acceptable_provider_health: false,
    no_unresolved_migrations: false,
    no_major_leader_flapping: false,
    no_stale_data_as_live: false,
    no_severe_browser_perf_regression: false,
    support_docs_updated: false,
    platform_guide_updated: false,
  };
}

export function sanitizeExpansionGates(
  raw: unknown
): ExpansionGateState {
  const base = emptyExpansionGates();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const id of MONITOR_EXPANSION_GATES) {
    base[id] = obj[id] === true;
  }
  return base;
}

export function allExpansionGatesClear(gates: ExpansionGateState): boolean {
  return MONITOR_EXPANSION_GATES.every((id) => gates[id] === true);
}

export function missingExpansionGates(
  gates: ExpansionGateState
): MonitorExpansionGateId[] {
  return MONITOR_EXPANSION_GATES.filter((id) => gates[id] !== true);
}
