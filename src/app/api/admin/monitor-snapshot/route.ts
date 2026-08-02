import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  getMonitorSnapshotDiagnostics,
  publishMonitorSnapshotFromHub,
  rollbackMonitorSnapshot,
  getActiveMonitorPublicSnapshot,
} from "@/lib/monitor/snapshot";
import {
  MONITOR_SNAPSHOT_CALCULATION_VERSION,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
} from "@/domain/monitor/snapshot";

export const dynamic = "force-dynamic";

/** Admin diagnostics for the continuously maintained Monitor snapshot. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-snapshot:${gate.user.id}:${clientIp(req)}`,
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

  const diagnostics = await getMonitorSnapshotDiagnostics();
  return NextResponse.json({
    schemaVersion: MONITOR_SNAPSHOT_SCHEMA_VERSION,
    calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
    ...diagnostics,
  });
}

/**
 * Admin actions: rebuild from hub, rollback to previous valid snapshot.
 * Never exposes provider credentials or private user data.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-snapshot-post:${gate.user.id}:${clientIp(req)}`,
    30,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
  };

  if (body.action === "rebuild") {
    const result = await publishMonitorSnapshotFromHub({ flush: true });
    const active = await getActiveMonitorPublicSnapshot();
    return NextResponse.json({ ok: true, result, active: active?.snapshotId ?? null });
  }

  if (body.action === "rollback") {
    const snap = await rollbackMonitorSnapshot();
    return NextResponse.json({
      ok: Boolean(snap),
      snapshotId: snap?.snapshotId ?? null,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
