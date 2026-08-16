import { NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getMonitorDeliveryHub } from "@/lib/monitor/delivery/server-hub";
import { MONITOR_DELIVERY_VERSION } from "@/domain/monitor/delivery";
import { isMonitorGloballyDisabled } from "@/lib/monitor/flags";
import { loadMonitorOpsControls } from "@/lib/monitor/ops/controls-store";
import { getActiveMonitorPublicSnapshot } from "@/lib/monitor/snapshot";
import { publicSnapshotToLadderSnapshot } from "@/lib/monitor/snapshot/to-delivery";
import {
  MONITOR_SNAPSHOT_CALCULATION_VERSION,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
} from "@/domain/monitor/snapshot";

export const dynamic = "force-dynamic";

/**
 * Compact ladder snapshot for Monitor clients.
 * Prefers the continuously maintained Redis public snapshot when present;
 * falls back to the process-local delivery hub.
 */
export async function GET(req: Request) {
  const auth = await requireTrustTickerAccess();
  if (auth.error) return auth.error;

  await loadMonitorOpsControls();
  if (isMonitorGloballyDisabled()) {
    return NextResponse.json(
      { error: "Monitor snapshot unavailable" },
      { status: 503 }
    );
  }

  const rl = await rateLimit(
    `monitor-snapshot:${auth.user.id}:${clientIp(req)}`,
    60,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const publicSnap = await getActiveMonitorPublicSnapshot();
  if (publicSnap) {
    return NextResponse.json({
      version: MONITOR_DELIVERY_VERSION,
      schemaVersion: MONITOR_SNAPSHOT_SCHEMA_VERSION,
      calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
      source: "public_snapshot",
      snapshot: publicSnapshotToLadderSnapshot(publicSnap),
      publicSnapshot: {
        snapshotId: publicSnap.snapshotId,
        lastEventId: publicSnap.lastEventId,
        generatedAt: publicSnap.generatedAt,
        globalLeader: publicSnap.globalLeader,
        dataQuality: publicSnap.dataQuality,
        marketSession: publicSnap.marketSession,
        priorityLadder: publicSnap.priorityLadder,
        momentumField: publicSnap.momentumField,
        recentEventTape: publicSnap.recentEventTape,
        sourceHealthSummary: publicSnap.sourceHealthSummary,
        marketStateAgeMs: publicSnap.marketStateAgeMs,
        recovery: publicSnap.recovery,
      },
      metrics: {
        trackedSymbols: publicSnap.priorityLadder.length,
        health: publicSnap.dataQuality,
        lagMsAvg: publicSnap.marketStateAgeMs ?? 0,
        outboundQueueDepth: 0,
      },
    });
  }

  const hub = getMonitorDeliveryHub();
  const snapshot = hub.latestSnapshot();
  return NextResponse.json({
    version: MONITOR_DELIVERY_VERSION,
    source: "delivery_hub",
    snapshot,
    metrics: {
      trackedSymbols: hub.metrics().trackedSymbols,
      health: hub.metrics().health,
      lagMsAvg: Math.round(hub.metrics().lagMsAvg),
      outboundQueueDepth: hub.metrics().outboundQueueDepth,
    },
  });
}
