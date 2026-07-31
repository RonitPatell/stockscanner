import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import {
  classifyFeedHealth,
  getSystemHealth,
  setFeedMeta,
} from "@/lib/system-health";
import { getIngestLatencyStats } from "@/lib/speed-wins";

export const dynamic = "force-dynamic";

/** Public liveness — no internal error payloads or pipeline dumps. */
export async function GET() {
  const { items, meta } = await getCachedFeed("all");

  if (meta) {
    setFeedMeta(meta.updatedAt, meta.count, meta.source);
  } else if (items.length > 0) {
    setFeedMeta(null, items.length, "memory");
  }

  const health = getSystemHealth(isScaleMode());
  const freshness = classifyFeedHealth(health);
  const latency = await getIngestLatencyStats(24).catch(() => null);
  const avgIngestDelaySec =
    latency?.p50Sec ?? latency?.avgSec ?? health.avgIngestDelaySec ?? null;

  return NextResponse.json(
    {
      status: freshness.status,
      feedAgeSec: freshness.feedAgeSec,
      scaleMode: health.scaleMode,
      wireCycleMs: health.wireCycleMs,
      feedItemCount: health.feedItemCount,
      feedUpdatedAt: health.feedUpdatedAt,
      feedSource: health.feedSource === "none" ? "none" : "ok",
      pipelineInFlight: health.pipelineInFlight,
      wireInFlight: health.wireInFlight,
      /** Desk/wire p50 seconds — not editorial RSS publish age */
      avgIngestDelaySec:
        avgIngestDelaySec != null ? Math.round(avgIngestDelaySec) : null,
      latencyMetric: latency?.metric ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
