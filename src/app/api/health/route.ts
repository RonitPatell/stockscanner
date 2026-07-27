import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import {
  classifyFeedHealth,
  getSystemHealth,
  setFeedMeta,
} from "@/lib/system-health";

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
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
