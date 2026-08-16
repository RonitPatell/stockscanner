import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getMonitorDeliveryHub } from "@/lib/monitor/delivery/server-hub";
import {
  assertAckHasNoPrivateFields,
  buildMonitorSyncAck,
} from "@/domain/monitor/sync";

export const dynamic = "force-dynamic";

/**
 * Client acknowledgement of sync progress (observability).
 * Never accepts watchlists, strategies, or other private fields.
 */
export async function POST(req: NextRequest) {
  const auth = await requireTrustTickerAccess();
  if (auth.error) return auth.error;

  const rl = await rateLimit(
    `monitor-ack:${auth.user.id}:${clientIp(req)}`,
    120,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 120) }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const forbidden = assertAckHasNoPrivateFields(body);
  if (forbidden.length) {
    return NextResponse.json(
      { error: "private_fields_forbidden" },
      { status: 400 }
    );
  }

  const ack = buildMonitorSyncAck({
    streamConnected: body.streamConnected === true,
    snapshotId:
      typeof body.snapshotId === "string" || body.snapshotId === null
        ? (body.snapshotId as string | null)
        : null,
    lastEventReceived:
      typeof body.lastEventReceived === "string" ||
      body.lastEventReceived === null
        ? (body.lastEventReceived as string | null)
        : null,
    lastEventApplied:
      typeof body.lastEventApplied === "string" || body.lastEventApplied === null
        ? (body.lastEventApplied as string | null)
        : null,
    liveSyncCompleted: body.liveSyncCompleted === true,
    sequence: Number(body.sequence),
  });

  if (ack.sequence >= 1) {
    getMonitorDeliveryHub().acknowledge(ack.sequence);
  }

  return NextResponse.json({ ok: true, ack });
}
