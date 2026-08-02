/**
 * PostgreSQL durable compact snapshot + separate error log.
 * Controlled schedule — not every Redis publish.
 */

import type { MonitorPublicSnapshot } from "@/domain/monitor/snapshot";
import { prisma } from "@/lib/prisma";

export interface DurableSnapshotRow {
  snapshotId: string;
  schemaVersion: string;
  calculationVersion: string;
  lastEventId: string;
  generatedAt: Date;
  marketSession: string;
  isRecovery: boolean;
}

/** Compact payload for PG — same public fields, no secrets. */
function compactPayload(snap: MonitorPublicSnapshot): Record<string, unknown> {
  return {
    schemaVersion: snap.schemaVersion,
    calculationVersion: snap.calculationVersion,
    snapshotId: snap.snapshotId,
    lastEventId: snap.lastEventId,
    generatedAt: snap.generatedAt,
    generatedAtMs: snap.generatedAtMs,
    marketSession: snap.marketSession,
    globalLeader: snap.globalLeader,
    priorityLadder: snap.priorityLadder,
    momentumField: snap.momentumField,
    recentEventTape: snap.recentEventTape,
    sourceHealthSummary: snap.sourceHealthSummary,
    dataQuality: snap.dataQuality,
    marketStateAgeMs: snap.marketStateAgeMs,
    recovery: snap.recovery,
    freshness: snap.freshness,
  };
}

export async function persistDurableMonitorSnapshot(
  snap: MonitorPublicSnapshot
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const row = await prisma.monitorPublicSnapshot.upsert({
      where: { snapshotId: snap.snapshotId },
      create: {
        snapshotId: snap.snapshotId,
        schemaVersion: snap.schemaVersion,
        calculationVersion: snap.calculationVersion,
        lastEventId: snap.lastEventId,
        generatedAt: new Date(snap.generatedAtMs),
        marketSession: snap.marketSession,
        isRecovery: snap.recovery,
        payloadJson: compactPayload(snap),
      },
      update: {
        schemaVersion: snap.schemaVersion,
        calculationVersion: snap.calculationVersion,
        lastEventId: snap.lastEventId,
        generatedAt: new Date(snap.generatedAtMs),
        marketSession: snap.marketSession,
        isRecovery: snap.recovery,
        payloadJson: compactPayload(snap),
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "persist_failed";
    return { ok: false, error: message };
  }
}

export async function recordMonitorSnapshotBuildError(input: {
  stage: string;
  message: string;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.monitorSnapshotBuildError.create({
      data: {
        stage: input.stage.slice(0, 120),
        message: input.message.slice(0, 2_000),
        detailJson: input.detail ?? undefined,
      },
    });
  } catch {
    /* never throw from error logger */
  }
}

export async function listRecentSnapshotBuildErrors(limit = 20): Promise<
  Array<{
    id: string;
    stage: string;
    message: string;
    createdAt: Date;
  }>
> {
  return prisma.monitorSnapshotBuildError.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: {
      id: true,
      stage: true,
      message: true,
      createdAt: true,
    },
  });
}

/** Latest durable compact snapshot for SSR fallback when Redis is cold/timed out. */
export async function loadLatestDurableMonitorSnapshot(): Promise<MonitorPublicSnapshot | null> {
  try {
    const row = await prisma.monitorPublicSnapshot.findFirst({
      orderBy: { generatedAt: "desc" },
      select: { payloadJson: true },
    });
    if (!row?.payloadJson || typeof row.payloadJson !== "object") return null;
    const snap = row.payloadJson as unknown as MonitorPublicSnapshot;
    const { needsSnapshotUpgrade, upgradeMonitorPublicSnapshot } = await import(
      "@/domain/monitor/snapshot"
    );
    if (needsSnapshotUpgrade(snap)) {
      return upgradeMonitorPublicSnapshot(snap, {
        nowMs: snap.generatedAtMs,
        recovery: true,
        marketSession: snap.marketSession,
      });
    }
    return snap;
  } catch {
    return null;
  }
}
