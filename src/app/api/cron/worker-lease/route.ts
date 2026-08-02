import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import {
  acquireWorkerLease,
  renewWorkerLease,
  releaseWorkerLease,
  type LeaseHandle,
} from "@/lib/workers/lease";
import { writeWorkerHeartbeat } from "@/lib/workers/heartbeat";
import type { WorkerHeartbeatName } from "@/lib/workers/heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ALLOWED_LEASES = new Set([
  "realtime_supervisor",
  "quote_stream",
  "monitor_market",
  "priority_ingest",
]);

const ALLOWED_HB = new Set<WorkerHeartbeatName>([
  "realtime_supervisor",
  "quote_stream",
  "priority_ingest",
  "monitor_market",
  "scanner_warm",
]);

/**
 * Distributed lease + heartbeat for dedicated market workers.
 * Fail-closed without CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  let body: {
    action?: string;
    name?: string;
    token?: string;
    ttlMs?: number;
    heartbeat?: {
      name?: string;
      instanceId?: string;
      meta?: Record<string, unknown>;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = (body.action ?? "").trim();
  const name = (body.name ?? "").trim();

  if (action === "heartbeat") {
    const hbName = body.heartbeat?.name ?? name;
    if (!ALLOWED_HB.has(hbName as WorkerHeartbeatName)) {
      return NextResponse.json({ error: "invalid_heartbeat" }, { status: 400 });
    }
    await writeWorkerHeartbeat({
      name: hbName as WorkerHeartbeatName,
      updatedAtMs: Date.now(),
      instanceId: String(body.heartbeat?.instanceId ?? "worker").slice(0, 64),
      meta: {
        providerConnected: Boolean(body.heartbeat?.meta?.providerConnected),
        universeLoaded: Boolean(body.heartbeat?.meta?.universeLoaded),
        baselinesLoaded: Boolean(body.heartbeat?.meta?.baselinesLoaded),
        snapshotPublished: Boolean(body.heartbeat?.meta?.snapshotPublished),
        session:
          typeof body.heartbeat?.meta?.session === "string"
            ? body.heartbeat.meta.session
            : undefined,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (!ALLOWED_LEASES.has(name)) {
    return NextResponse.json({ error: "invalid_lease" }, { status: 400 });
  }

  if (action === "acquire") {
    const result = await acquireWorkerLease(name, body.ttlMs ?? 45_000);
    return NextResponse.json({
      ok: result.acquired,
      acquired: result.acquired,
      token: result.handle?.token ?? null,
      ttlMs: result.handle?.ttlMs ?? null,
    });
  }

  if (action === "renew") {
    if (!body.token) {
      return NextResponse.json({ error: "token_required" }, { status: 400 });
    }
    const handle: LeaseHandle = {
      name,
      token: body.token,
      ttlMs: body.ttlMs ?? 45_000,
    };
    const ok = await renewWorkerLease(handle);
    return NextResponse.json({ ok, acquired: ok });
  }

  if (action === "release") {
    if (!body.token) {
      return NextResponse.json({ error: "token_required" }, { status: 400 });
    }
    await releaseWorkerLease({
      name,
      token: body.token,
      ttlMs: body.ttlMs ?? 45_000,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
