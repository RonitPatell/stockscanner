import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import { getSystemHealth } from "@/lib/system-health";
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

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    latency,
    feed: {
      itemCount: feed.items.length,
      updatedAt: feed.meta?.updatedAt ?? null,
      status: health.pipelineInFlight ? "ingesting" : feed.items.length > 0 ? "live" : "starting",
    },
    wireCycleSec: 8,
    recentWins: wins,
    scaleMode: isScaleMode(),
  });
}
