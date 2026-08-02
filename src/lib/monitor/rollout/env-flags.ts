/**
 * Env wiring for named Monitor rollout flags.
 * Defaults: master on in development; subsystems follow master except marketStream (off).
 */

import type { MonitorRolloutFlagId } from "@/domain/monitor/rollout";
import { parseMonitorRolloutStage, type MonitorRolloutStageId } from "@/domain/monitor/rollout";

function truthyEnv(raw: string | undefined): boolean | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return null;
}

function envFlag(
  keys: string[],
  defaultWhenUnset: boolean
): boolean {
  for (const k of keys) {
    const t = truthyEnv(process.env[k]);
    if (t != null) return t;
  }
  return defaultWhenUnset;
}

/** Master monitorV1 env (ignores cohort / opt-out). */
export function readMonitorV1EnvEnabled(): boolean {
  return envFlag(
    [
      "NEXT_PUBLIC_MONITOR_V1",
      "MONITOR_V1",
      "NEXT_PUBLIC_MONITOR_ENABLED",
      "MONITOR_ENABLED",
    ],
    process.env.NODE_ENV === "development"
  );
}

export function readSubsystemEnvFlags(
  masterDefault: boolean
): Record<MonitorRolloutFlagId, boolean> {
  const master = readMonitorV1EnvEnabled();
  // When master off, all subsystems off.
  if (!master) {
    return {
      monitorV1: false,
      marketStreamV1: false,
      momentumEngineV1: false,
      priorityEngineV1: false,
      momentumFieldV1: false,
      monitorSquawkV1: false,
      monitorReplayV1: false,
    };
  }

  const inherit = masterDefault && master;

  return {
    monitorV1: true,
    marketStreamV1: envFlag(
      [
        "NEXT_PUBLIC_MARKET_STREAM_V1",
        "MARKET_STREAM_V1",
        "NEXT_PUBLIC_MONITOR_LIVE_DELIVERY",
        "MONITOR_LIVE_DELIVERY",
      ],
      false // live stream stays opt-in
    ),
    momentumEngineV1: envFlag(
      ["NEXT_PUBLIC_MOMENTUM_ENGINE_V1", "MOMENTUM_ENGINE_V1", "MONITOR_MOMENTUM_V1"],
      inherit
    ),
    priorityEngineV1: envFlag(
      ["NEXT_PUBLIC_PRIORITY_ENGINE_V1", "PRIORITY_ENGINE_V1", "MONITOR_ATTENTION_V1"],
      inherit
    ),
    momentumFieldV1: envFlag(
      ["NEXT_PUBLIC_MOMENTUM_FIELD_V1", "MOMENTUM_FIELD_V1"],
      inherit
    ),
    monitorSquawkV1: envFlag(
      ["NEXT_PUBLIC_MONITOR_SQUAWK_V1", "MONITOR_SQUAWK_V1"],
      inherit
    ),
    monitorReplayV1: envFlag(
      ["NEXT_PUBLIC_MONITOR_REPLAY_V1", "MONITOR_REPLAY_V1"],
      inherit
    ),
  };
}

export function readEnvRolloutStage(): MonitorRolloutStageId | null {
  return parseMonitorRolloutStage(
    process.env.MONITOR_ROLLOUT_STAGE ?? process.env.NEXT_PUBLIC_MONITOR_ROLLOUT_STAGE
  );
}

export function parseEmailList(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const part of (raw ?? "").split(/[,;\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e.includes("@")) set.add(e);
  }
  return set;
}

export function trustedTesterEmails(): Set<string> {
  return parseEmailList(process.env.MONITOR_TRUSTED_TESTER_EMAILS);
}

export function foundingUserEmails(): Set<string> {
  return parseEmailList(process.env.MONITOR_FOUNDING_USER_EMAILS);
}
