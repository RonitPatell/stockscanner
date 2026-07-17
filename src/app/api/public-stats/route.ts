import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import { classifyFeedHealth, getSystemHealth } from "@/lib/system-health";
import { getIngestLatencyStats, getSpeedWins } from "@/lib/speed-wins";

export const dynamic = "force-dynamic";

/** Public proof stats for landing page — latency + recent wins */
export async function GET() {
  const [latency, wins, feed] = await Promise.all([
    getIngestLatencyStats(24),
    getSpeedWins(5, 72, "fastest"),
    getCachedFeed("all"),
  ]);

  const health = getSystemHealth(isScaleMode());
  const freshness = classifyFeedHealth({
    ...health,
    feedUpdatedAt: feed.meta?.updatedAt ?? null,
    feedItemCount: feed.items.length,
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    latency,
    feed: {
      itemCount: feed.items.length,
      updatedAt: feed.meta?.updatedAt ?? null,
      status: freshness.status,
      ageSec: freshness.feedAgeSec,
    },
    sourcePollCycleSec: Math.round(health.wireCycleMs / 1000),
    // Backward-compatible alias for older clients.
    wireCycleSec: Math.round(health.wireCycleMs / 1000),
    recentWins: wins,
    scaleMode: isScaleMode(),
  });
}
