/**
 * Server-side Monitor rollout resolution for a user session.
 */

import { createHash } from "crypto";
import { isAdminEmail } from "@/lib/api-guard";
import {
  parseMonitorRolloutStage,
  resolveMonitorRollout,
  stickyPercentBucket,
  type ResolvedMonitorRollout,
  type MonitorRolloutStageId,
} from "@/domain/monitor/rollout";
import { getMonitorOpsControlsSync, loadMonitorOpsControls } from "@/lib/monitor/ops/controls-store";
import {
  foundingUserEmails,
  readEnvRolloutStage,
  readMonitorV1EnvEnabled,
  readSubsystemEnvFlags,
  trustedTesterEmails,
} from "./env-flags";
import { getMonitorBuildDiagnostics } from "./versions";

function hashHex32(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function resolveActiveRolloutStage(
  cohortRaw: string | null | undefined
): MonitorRolloutStageId | null {
  const fromOps = parseMonitorRolloutStage(cohortRaw);
  if (fromOps) return fromOps;
  return readEnvRolloutStage();
}

export async function resolveMonitorRolloutForUser(input: {
  userId: string;
  email: string | null | undefined;
  isEligibleSubscriber: boolean;
  optOut: boolean;
}): Promise<ResolvedMonitorRollout & { diagnostics: ReturnType<typeof getMonitorBuildDiagnostics> }> {
  await loadMonitorOpsControls();
  const controls = getMonitorOpsControlsSync();
  const stage = resolveActiveRolloutStage(controls.featureFlagCohort);
  const email = (input.email ?? "").trim().toLowerCase();
  const resolved = resolveMonitorRollout({
    stage,
    cohortRaw: controls.featureFlagCohort,
    globallyDisabled: controls.monitorGloballyDisabled,
    masterEnvEnabled: readMonitorV1EnvEnabled(),
    subsystemEnv: readSubsystemEnvFlags(true),
    optOut: input.optOut,
    email,
    userId: input.userId,
    isAdmin: isAdminEmail(input.email),
    isTrustedTester: trustedTesterEmails().has(email),
    isFoundingUser: foundingUserEmails().has(email),
    isEligibleSubscriber: input.isEligibleSubscriber,
    stickyBucket: stickyPercentBucket(input.userId, hashHex32),
  });

  return {
    ...resolved,
    diagnostics: getMonitorBuildDiagnostics(),
  };
}
