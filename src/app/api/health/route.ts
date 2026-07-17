import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import {
  classifyFeedHealth,
  getSystemHealth,
  setFeedMeta,
} from "@/lib/system-health";

export const dynamic = "force-dynamic";

/** Public system health + feed freshness — cache-only, no DB on hot path */
export async function GET() {
  const { items, meta } = await getCachedFeed("all");

  if (meta) {
    setFeedMeta(meta.updatedAt, meta.count, meta.source);
  } else if (items.length > 0) {
    setFeedMeta(null, items.length, "memory");
  }

  const health = getSystemHealth(isScaleMode());
  const freshness = classifyFeedHealth(health);
  return NextResponse.json({
    ...health,
    ...freshness,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
