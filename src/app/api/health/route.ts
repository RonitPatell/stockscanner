import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import { getSystemHealth, setFeedMeta } from "@/lib/system-health";

export const dynamic = "force-dynamic";

/** Public system health + feed freshness — cache-only, no DB on hot path */
export async function GET() {
  const { items, meta } = await getCachedFeed("all");

  if (meta) {
    setFeedMeta(meta.updatedAt, meta.count, meta.source);
  } else if (items.length > 0) {
    setFeedMeta(new Date().toISOString(), items.length, "memory");
  }

  const health = getSystemHealth(isScaleMode());
  return NextResponse.json({
    ...health,
    status: health.pipelineInFlight
      ? "ingesting"
      : health.feedUpdatedAt
        ? "live"
        : "starting",
  });
}
