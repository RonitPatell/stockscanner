/**
 * Staged Monitor rollout cohorts (1 → 6).
 * Percent stages use sticky buckets (0–99) — not random per request.
 */

export const MONITOR_ROLLOUT_STAGES = [
  "stage_1_internal_admins",
  "stage_2_trusted_testers",
  "stage_3_founding_users",
  "stage_4_percent_10",
  "stage_5_percent_50",
  "stage_6_full",
] as const;

export type MonitorRolloutStageId = (typeof MONITOR_ROLLOUT_STAGES)[number];

export const MONITOR_ROLLOUT_ROLLBACK_COHORTS = [
  "monitor-v1-rollback",
  "off",
] as const;

export type MonitorRolloutRollbackId =
  (typeof MONITOR_ROLLOUT_ROLLBACK_COHORTS)[number];

export interface MonitorRolloutStageMeta {
  id: MonitorRolloutStageId;
  order: number;
  label: string;
  /** Max sticky bucket exclusive for percent stages; null = membership list only. */
  percentCap: number | null;
  description: string;
}

export const MONITOR_ROLLOUT_STAGE_META: Record<
  MonitorRolloutStageId,
  MonitorRolloutStageMeta
> = {
  stage_1_internal_admins: {
    id: "stage_1_internal_admins",
    order: 1,
    label: "1 · Internal admins",
    percentCap: null,
    description: "ADMIN_EMAILS only.",
  },
  stage_2_trusted_testers: {
    id: "stage_2_trusted_testers",
    order: 2,
    label: "2 · Five trusted testers",
    percentCap: null,
    description: "Admins + MONITOR_TRUSTED_TESTER_EMAILS (target ~5).",
  },
  stage_3_founding_users: {
    id: "stage_3_founding_users",
    order: 3,
    label: "3 · Twenty-five founding users",
    percentCap: null,
    description: "Prior cohorts + MONITOR_FOUNDING_USER_EMAILS (target ~25).",
  },
  stage_4_percent_10: {
    id: "stage_4_percent_10",
    order: 4,
    label: "4 · Ten percent of eligible subscribers",
    percentCap: 10,
    description: "Prior lists + sticky 10% of eligible Pro subscribers.",
  },
  stage_5_percent_50: {
    id: "stage_5_percent_50",
    order: 5,
    label: "5 · Fifty percent",
    percentCap: 50,
    description: "Prior lists + sticky 50% of eligible Pro subscribers.",
  },
  stage_6_full: {
    id: "stage_6_full",
    order: 6,
    label: "6 · Full eligible rollout",
    percentCap: 100,
    description: "All eligible Pro subscribers (unless opt-out).",
  },
};

export function parseMonitorRolloutStage(
  raw: string | null | undefined
): MonitorRolloutStageId | null {
  const v = (raw ?? "").trim();
  if ((MONITOR_ROLLOUT_STAGES as readonly string[]).includes(v)) {
    return v as MonitorRolloutStageId;
  }
  // Aliases
  const aliases: Record<string, MonitorRolloutStageId> = {
    "1": "stage_1_internal_admins",
    admins: "stage_1_internal_admins",
    "2": "stage_2_trusted_testers",
    testers: "stage_2_trusted_testers",
    "3": "stage_3_founding_users",
    founding: "stage_3_founding_users",
    "4": "stage_4_percent_10",
    "10pct": "stage_4_percent_10",
    "5": "stage_5_percent_50",
    "50pct": "stage_5_percent_50",
    "6": "stage_6_full",
    full: "stage_6_full",
    ga: "stage_6_full",
  };
  return aliases[v.toLowerCase()] ?? null;
}

export function isRollbackCohort(raw: string | null | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return (
    v === "monitor-v1-rollback" ||
    v === "off" ||
    v === "rollback"
  );
}

export function nextRolloutStage(
  current: MonitorRolloutStageId
): MonitorRolloutStageId | null {
  const order = MONITOR_ROLLOUT_STAGE_META[current].order;
  const next = MONITOR_ROLLOUT_STAGES.find(
    (id) => MONITOR_ROLLOUT_STAGE_META[id].order === order + 1
  );
  return next ?? null;
}

/**
 * Deterministic sticky bucket 0–99 for percent cohorts.
 * Pure — pass a hash function from lib (Node crypto) or tests.
 */
export function stickyPercentBucket(
  userId: string,
  hashHex32: (input: string) => string
): number {
  const hex = hashHex32(`monitor-rollout-v1:${userId}`);
  const n = Number.parseInt(hex.slice(0, 8), 16);
  if (!Number.isFinite(n)) return 99;
  return Math.abs(n) % 100;
}

export interface CohortMembershipInput {
  email: string | null | undefined;
  userId: string;
  isAdmin: boolean;
  isTrustedTester: boolean;
  isFoundingUser: boolean;
  /** Eligible Pro / active subscriber */
  isEligibleSubscriber: boolean;
  stickyBucket: number;
  stage: MonitorRolloutStageId;
}

/** Whether the user is in the active cohort for the given stage. */
export function userInRolloutCohort(input: CohortMembershipInput): boolean {
  if (!input.isEligibleSubscriber && !input.isAdmin) return false;

  const stageOrder = MONITOR_ROLLOUT_STAGE_META[input.stage].order;

  // Stages 1–3: membership lists (admins always included from stage 1)
  if (stageOrder >= 1 && input.isAdmin) return true;
  if (stageOrder >= 2 && input.isTrustedTester) return true;
  if (stageOrder >= 3 && input.isFoundingUser) return true;

  if (stageOrder < 4) return false;

  if (!input.isEligibleSubscriber) return false;
  const cap = MONITOR_ROLLOUT_STAGE_META[input.stage].percentCap ?? 0;
  return input.stickyBucket < cap;
}
