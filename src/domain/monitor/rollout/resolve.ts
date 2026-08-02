/**
 * Pure Monitor rollout resolution (no I/O).
 */

import {
  defaultSubsystemFlagMap,
  type MonitorRolloutFlagId,
} from "./flags.ts";
import {
  isRollbackCohort,
  userInRolloutCohort,
  type MonitorRolloutStageId,
} from "./cohorts.ts";

export interface ResolveMonitorRolloutInput {
  stage: MonitorRolloutStageId | null;
  /** Ops / env cohort string (may be rollback). */
  cohortRaw: string | null;
  globallyDisabled: boolean;
  /** Master env flag (monitorV1). */
  masterEnvEnabled: boolean;
  subsystemEnv: Record<MonitorRolloutFlagId, boolean>;
  optOut: boolean;
  email: string | null;
  userId: string;
  isAdmin: boolean;
  isTrustedTester: boolean;
  isFoundingUser: boolean;
  isEligibleSubscriber: boolean;
  stickyBucket: number;
}

export interface ResolvedMonitorRollout {
  masterEnabled: boolean;
  inCohort: boolean;
  optedOut: boolean;
  rolledBack: boolean;
  globallyDisabled: boolean;
  stage: MonitorRolloutStageId | null;
  flags: Record<MonitorRolloutFlagId, boolean>;
  reason: string;
  /** Prefer Feed / legacy desk when Monitor is unavailable. */
  fallbackView: "feed";
  fallbackShell: "legacy";
}

export function resolveMonitorRollout(
  input: ResolveMonitorRolloutInput
): ResolvedMonitorRollout {
  const rolledBack = isRollbackCohort(input.cohortRaw);
  const optedOut = input.optOut === true;

  if (input.globallyDisabled) {
    return deny(input, "globally_disabled", rolledBack, optedOut);
  }
  if (rolledBack) {
    return deny(input, "cohort_rollback", true, optedOut);
  }
  if (!input.masterEnvEnabled) {
    return deny(input, "master_flag_off", false, optedOut);
  }
  if (optedOut) {
    return deny(input, "user_opt_out", false, true);
  }
  if (!input.stage) {
    // No staged cohort configured — env master alone (dev / explicit full-on).
    const flags = mergeFlags(true, input.subsystemEnv);
    return {
      masterEnabled: true,
      inCohort: true,
      optedOut: false,
      rolledBack: false,
      globallyDisabled: false,
      stage: null,
      flags,
      reason: "env_master_no_stage",
      fallbackView: "feed",
      fallbackShell: "legacy",
    };
  }

  const inCohort = userInRolloutCohort({
    email: input.email,
    userId: input.userId,
    isAdmin: input.isAdmin,
    isTrustedTester: input.isTrustedTester,
    isFoundingUser: input.isFoundingUser,
    isEligibleSubscriber: input.isEligibleSubscriber,
    stickyBucket: input.stickyBucket,
    stage: input.stage,
  });

  if (!inCohort) {
    return deny(input, "outside_cohort", false, false);
  }

  const flags = mergeFlags(true, input.subsystemEnv);
  return {
    masterEnabled: true,
    inCohort: true,
    optedOut: false,
    rolledBack: false,
    globallyDisabled: false,
    stage: input.stage,
    flags,
    reason: "cohort_allow",
    fallbackView: "feed",
    fallbackShell: "legacy",
  };
}

function mergeFlags(
  master: boolean,
  subsystemEnv: Record<MonitorRolloutFlagId, boolean>
): Record<MonitorRolloutFlagId, boolean> {
  const base = defaultSubsystemFlagMap(false);
  if (!master) return base;
  for (const id of Object.keys(base) as MonitorRolloutFlagId[]) {
    // Subsystem must be env-enabled; master gates trader exposure.
    base[id] = Boolean(subsystemEnv[id]);
  }
  base.monitorV1 = true;
  return base;
}

function deny(
  input: ResolveMonitorRolloutInput,
  reason: string,
  rolledBack: boolean,
  optedOut: boolean
): ResolvedMonitorRollout {
  return {
    masterEnabled: false,
    inCohort: false,
    optedOut,
    rolledBack,
    globallyDisabled: input.globallyDisabled,
    stage: input.stage,
    flags: defaultSubsystemFlagMap(false),
    reason,
    fallbackView: "feed",
    fallbackShell: "legacy",
  };
}
