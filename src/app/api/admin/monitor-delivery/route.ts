import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getMonitorDeliveryHub } from "@/lib/monitor/delivery/server-hub";
import { MONITOR_DELIVERY_VERSION } from "@/domain/monitor/delivery";

export const dynamic = "force-dynamic";

/** Admin observability: lag, drops, queues, circuits, acks. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-delivery:${gate.user.id}:${clientIp(req)}`,
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

  const hub = getMonitorDeliveryHub();
  return NextResponse.json({
    version: MONITOR_DELIVERY_VERSION,
    metrics: hub.metrics(),
    snapshotPreview: {
      leader: hub.latestSnapshot().leaderSymbol,
      ladderSize: hub.latestSnapshot().symbols.length,
      tracked: hub.latestSnapshot().trackedSymbolCount,
      health: hub.latestSnapshot().health,
    },
  });
}
