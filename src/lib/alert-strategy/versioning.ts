import { createHash } from "node:crypto";
import { ALERT_STRATEGY_SCHEMA_VERSION } from "./version.ts";
import type { AlertStrategy, StrategyConditionGroup, StrategyCondition } from "./types.ts";

/**
 * Content hash of rule body (excludes version / timestamps).
 * Used to detect silent mutation attempts.
 */
export function strategyContentHash(strategy: AlertStrategy): string {
  const body = {
    name: strategy.name,
    enabled: strategy.enabled,
    presetId: strategy.presetId,
    delivery: strategy.delivery,
    channels: strategy.channels,
    root: strategy.root,
    cooldownMinutes: strategy.cooldownMinutes,
    dailyAlertCap: strategy.dailyAlertCap,
    mutes: strategy.mutes ?? null,
    userNote: strategy.userNote ?? null,
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24);
}

export interface StrategyVersionSnapshot {
  strategyId: string;
  version: number;
  schemaVersion: string;
  contentHash: string;
  snapshot: AlertStrategy;
  savedAt: string;
  /** Why this version was created — never auto */
  changeNote?: string | null;
}

/**
 * Explicit save: bump version, stamp updatedAt.
 * Refuses to overwrite if caller passes expectedVersion that doesn't match
 * (optimistic concurrency — never silent overwrite).
 */
export function bumpStrategyVersion(
  previous: AlertStrategy | null,
  nextDraft: AlertStrategy,
  opts?: {
    expectedVersion?: number | null;
    changeNote?: string | null;
    nowIso?: string;
  }
): {
  strategy: AlertStrategy;
  snapshot: StrategyVersionSnapshot;
  refused: boolean;
  refuseReason: string | null;
} {
  const now = opts?.nowIso ?? new Date().toISOString();

  if (
    previous &&
    opts?.expectedVersion != null &&
    previous.version !== opts.expectedVersion
  ) {
    return {
      strategy: previous,
      snapshot: {
        strategyId: previous.id,
        version: previous.version,
        schemaVersion: previous.schemaVersion,
        contentHash: strategyContentHash(previous),
        snapshot: previous,
        savedAt: previous.updatedAt,
      },
      refused: true,
      refuseReason: `Version conflict: expected v${opts.expectedVersion}, current is v${previous.version}. Reload and save again — rules are never changed silently.`,
    };
  }

  const nextVersion = previous ? previous.version + 1 : Math.max(1, nextDraft.version || 1);
  const strategy: AlertStrategy = {
    ...nextDraft,
    id: previous?.id ?? nextDraft.id,
    schemaVersion: ALERT_STRATEGY_SCHEMA_VERSION,
    version: nextVersion,
    createdAt: previous?.createdAt ?? nextDraft.createdAt ?? now,
    updatedAt: now,
  };

  const snapshot: StrategyVersionSnapshot = {
    strategyId: strategy.id,
    version: strategy.version,
    schemaVersion: strategy.schemaVersion,
    contentHash: strategyContentHash(strategy),
    snapshot: structuredClone(strategy),
    savedAt: now,
    changeNote: opts?.changeNote ?? null,
  };

  return { strategy, snapshot, refused: false, refuseReason: null };
}

/** Ensure nested ids exist (import repair) — does not bump version. */
export function ensureConditionIds(
  group: StrategyConditionGroup,
  prefix = "g"
): StrategyConditionGroup {
  const gid =
    group.id ||
    `${prefix}_${createHash("sha256").update(JSON.stringify(group)).digest("hex").slice(0, 8)}`;
  return {
    ...group,
    id: gid,
    conditions: group.conditions.map((c, i) => ensureCondition(c, `${gid}_c${i}`)),
    groups: (group.groups ?? []).map((g, i) =>
      ensureConditionIds(g, `${gid}_g${i}`)
    ),
  };
}

function ensureCondition(c: StrategyCondition, fallbackId: string): StrategyCondition {
  return { ...c, id: c.id || fallbackId };
}
