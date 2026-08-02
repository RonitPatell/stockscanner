/**
 * Upgrade older public snapshots to the current schema before republish.
 * Never invents missing provider timestamps from server time.
 */

import { buildMonitorPublicSnapshot } from "./builder.ts";
import type { MonitorPublicSnapshot, NormalizedSnapshotTickerInput } from "./types.ts";
import {
  MONITOR_SNAPSHOT_CALCULATION_VERSION,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
} from "./version.ts";

function tickerToInput(
  t: MonitorPublicSnapshot["priorityLadder"][number]
): NormalizedSnapshotTickerInput {
  return {
    symbol: t.symbol,
    companyShortName: t.companyShortName,
    price: t.price,
    sessionChangePct: t.sessionChangePct,
    attentionPriority: t.attentionPriority ?? 0,
    momentumIntensity: t.momentumIntensity,
    momentumState: t.momentumState,
    direction: t.direction,
    reactionStage: t.reactionStage,
    tradeability: t.tradeability,
    primaryRisk: t.primaryRisk,
    catalyst: t.catalyst,
    quoteTimestampMs: t.quoteTimestampMs ?? t.lastQuoteAtMs ?? null,
    dataConfidence: t.dataConfidence,
    haltState: t.haltState,
    previousRank: t.rank,
    lastQuoteAtMs: t.lastQuoteAtMs ?? t.quoteTimestampMs ?? null,
    lastTradeAtMs: t.lastTradeAtMs ?? null,
    lastCatalystAtMs: t.lastCatalystAtMs ?? null,
    lastMarketEventAtMs: t.lastMarketEventAtMs ?? null,
    momentumCalculatedAtMs: t.momentumCalculatedAtMs ?? null,
    priorityCalculatedAtMs: t.priorityCalculatedAtMs ?? null,
    tradeabilityCalculatedAtMs: t.tradeabilityCalculatedAtMs ?? null,
    activityLevel: t.activityLevel,
    sourceHealth: t.sourceHealth,
  };
}

/**
 * Rebuild freshness/versions from an older snapshot payload.
 * Preserves event identity; updates schema/calc versions via builder.
 */
export function upgradeMonitorPublicSnapshot(
  snap: MonitorPublicSnapshot,
  opts?: {
    nowMs?: number;
    recovery?: boolean;
    marketSession?: MonitorPublicSnapshot["marketSession"];
    generationDurationMs?: number | null;
  }
): MonitorPublicSnapshot {
  const nowMs = opts?.nowMs ?? snap.generatedAtMs;
  const tickers = [
    ...snap.priorityLadder.map(tickerToInput),
    ...snap.momentumField
      .filter((t) => !snap.priorityLadder.some((p) => p.symbol === t.symbol))
      .map(tickerToInput),
  ];

  const rebuilt = buildMonitorPublicSnapshot({
    nowMs,
    lastEventId: snap.lastEventId,
    marketSession: opts?.marketSession ?? snap.marketSession,
    tickers,
    tapeEvents: snap.recentEventTape,
    sourceHealth: snap.sourceHealthSummary,
    marketStateAgeMs: snap.marketStateAgeMs,
    dataQuality: snap.dataQuality,
    recovery: opts?.recovery ?? snap.recovery,
    previous: snap,
    generationDurationMs: opts?.generationDurationMs ?? null,
    snapshotId: undefined,
  });

  // Preserve prior snapshot identity when only upgrading in place for recovery.
  return {
    ...rebuilt,
    schemaVersion: MONITOR_SNAPSHOT_SCHEMA_VERSION,
    calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
    snapshotId: snap.snapshotId,
    lastEventId: snap.lastEventId,
  };
}

export function needsSnapshotUpgrade(
  snap: MonitorPublicSnapshot | null | undefined
): boolean {
  if (!snap) return false;
  if (!snap.freshness) return true;
  if (!snap.schemaVersion?.includes("v1.1")) return true;
  const sample = snap.priorityLadder[0];
  if (sample && sample.fieldFreshness == null) return true;
  return false;
}
