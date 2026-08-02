/**
 * Named Monitor rollout flags (logical ids).
 * Env wiring lives in lib — domain only defines ids + defaults.
 */

export const MONITOR_ROLLOUT_FLAGS = [
  "monitorV1",
  "marketStreamV1",
  "momentumEngineV1",
  "priorityEngineV1",
  "momentumFieldV1",
  "monitorSquawkV1",
  "monitorReplayV1",
] as const;

export type MonitorRolloutFlagId = (typeof MONITOR_ROLLOUT_FLAGS)[number];

export type MonitorFlagState = {
  id: MonitorRolloutFlagId;
  /** Env / ops allow the feature binary to run. */
  envEnabled: boolean;
  /** User/cohort/opt-out gate for trader-visible surfaces. */
  userEnabled: boolean;
};

export function defaultSubsystemFlagMap(
  masterOn: boolean
): Record<MonitorRolloutFlagId, boolean> {
  return {
    monitorV1: masterOn,
    marketStreamV1: masterOn,
    momentumEngineV1: masterOn,
    priorityEngineV1: masterOn,
    momentumFieldV1: masterOn,
    monitorSquawkV1: masterOn,
    monitorReplayV1: masterOn,
  };
}
