import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { restoreDeliveryCheckpoint } from "@/lib/monitor/delivery/server-hub";
import {
  tickMonitorSnapshotService,
  getActiveMonitorPublicSnapshot,
  syncDeliveryHubFromPublicSnapshot,
} from "@/lib/monitor/snapshot";
import { writeWorkerHeartbeat } from "@/lib/workers/heartbeat";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTANCE = randomBytes(4).toString("hex");

/**
 * Continuously maintain the public Monitor snapshot in Redis.
 * Fail-closed without CRON_SECRET. Runs independently of browser traffic.
 * Restores from durable PG on cold Redis; CLOSED sessions keep a labeled snapshot.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  try {
    await restoreDeliveryCheckpoint().catch(() => false);
    const tick = await tickMonitorSnapshotService();
    const active = await getActiveMonitorPublicSnapshot();
    let synced = 0;
    if (active) {
      synced = await syncDeliveryHubFromPublicSnapshot(active);
    }
    await writeWorkerHeartbeat({
      name: "monitor_market",
      updatedAtMs: Date.now(),
      instanceId: `cron-${INSTANCE}`,
      meta: {
        snapshotPublished: Boolean(active),
        session: tick.session,
        universeLoaded: true,
        baselinesLoaded: !tick.workersUnhealthy,
        providerConnected: !tick.workersUnhealthy,
      },
    });
    return NextResponse.json({
      ok: true,
      tick,
      active: active
        ? {
            snapshotId: active.snapshotId,
            lastEventId: active.lastEventId,
            leader: active.globalLeader,
            ladder: active.priorityLadder.length,
            marketSession: active.marketSession,
            dataQuality: active.dataQuality,
          }
        : null,
      syncedToHub: synced,
    });
  } catch {
    return NextResponse.json(
      { error: "monitor_snapshot_tick_failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();
  const active = await getActiveMonitorPublicSnapshot();
  return NextResponse.json({
    ok: true,
    active: active
      ? {
          snapshotId: active.snapshotId,
          lastEventId: active.lastEventId,
          generatedAt: active.generatedAt,
          leader: active.globalLeader,
        }
      : null,
  });
}
