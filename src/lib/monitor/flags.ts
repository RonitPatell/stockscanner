/**
 * TrustTicker Monitor feature flags.
 * Logical names: monitorV1, marketStreamV1, momentumEngineV1, priorityEngineV1,
 * momentumFieldV1, monitorSquawkV1, monitorReplayV1.
 *
 * Cohort / opt-out resolution is server-side via resolveMonitorRolloutForUser.
 * These sync helpers are env + ops kill-switch only (safe for SSR shells).
 */

import { getMonitorOpsControlsSync } from "@/lib/monitor/ops/controls-store";
import { isRollbackCohort } from "@/domain/monitor/rollout";
import {
  readMonitorV1EnvEnabled,
  readSubsystemEnvFlags,
} from "@/lib/monitor/rollout/env-flags";

export function isMonitorGloballyDisabled(): boolean {
  return getMonitorOpsControlsSync().monitorGloballyDisabled === true;
}

export function getMonitorFeatureFlagCohort(): string | null {
  return getMonitorOpsControlsSync().featureFlagCohort;
}

/**
 * Env + global kill-switch. Does NOT apply per-user cohort or opt-out.
 * Prefer resolveMonitorRolloutForUser for trader-visible gating.
 */
export function isMonitorV1Enabled(): boolean {
  if (isMonitorGloballyDisabled()) return false;
  const cohort = getMonitorFeatureFlagCohort();
  if (isRollbackCohort(cohort)) return false;
  return readMonitorV1EnvEnabled();
}

/** Live SSE / market stream — opt-in env (marketStreamV1). */
export function isMonitorLiveDeliveryEnabled(): boolean {
  if (isMonitorGloballyDisabled()) return false;
  if (isRollbackCohort(getMonitorFeatureFlagCohort())) return false;
  return readSubsystemEnvFlags(true).marketStreamV1;
}

export function isMarketStreamV1Enabled(): boolean {
  return isMonitorLiveDeliveryEnabled();
}

export function isMomentumEngineV1Enabled(): boolean {
  return isMonitorV1Enabled() && readSubsystemEnvFlags(true).momentumEngineV1;
}

export function isPriorityEngineV1Enabled(): boolean {
  return isMonitorV1Enabled() && readSubsystemEnvFlags(true).priorityEngineV1;
}

export function isMomentumFieldV1Enabled(): boolean {
  return isMonitorV1Enabled() && readSubsystemEnvFlags(true).momentumFieldV1;
}

export function isMonitorSquawkV1Enabled(): boolean {
  return isMonitorV1Enabled() && readSubsystemEnvFlags(true).monitorSquawkV1;
}

export function isMonitorReplayV1Enabled(): boolean {
  return isMonitorV1Enabled() && readSubsystemEnvFlags(true).monitorReplayV1;
}

export const MONITOR_V1_FLAG = "monitorV1";
export const MARKET_STREAM_V1_FLAG = "marketStreamV1";
export const MOMENTUM_ENGINE_V1_FLAG = "momentumEngineV1";
export const PRIORITY_ENGINE_V1_FLAG = "priorityEngineV1";
export const MOMENTUM_FIELD_V1_FLAG = "momentumFieldV1";
export const MONITOR_SQUAWK_V1_FLAG = "monitorSquawkV1";
export const MONITOR_REPLAY_V1_FLAG = "monitorReplayV1";
export const MONITOR_LIVE_DELIVERY_FLAG = "monitorLiveDelivery";
