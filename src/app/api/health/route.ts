import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import {
  classifyFeedHealth,
  getSystemHealth,
  setFeedMeta,
} from "@/lib/system-health";
import { getIngestLatencyStats } from "@/lib/speed-wins";
import {
  collectMarketReadiness,
  toPublicMarketReadiness,
} from "@/lib/workers/market-readiness";

export const dynamic = "force-dynamic";

/**
 * Public liveness + sanitized market readiness aggregate.
 * No secrets, provider credentials, stack traces, or internal error strings.
 */
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

  let newestHeadlineAt: string | null = null;
  let newestHeadlineAgeSec: number | null = null;
  if (items.length > 0) {
    let newestMs = 0;
    for (const c of items) {
      const t = Date.parse(c.publishedAt);
      if (Number.isFinite(t) && t > newestMs) newestMs = t;
    }
    if (newestMs > 0) {
      newestHeadlineAt = new Date(newestMs).toISOString();
      newestHeadlineAgeSec = Math.max(
        0,
        Math.floor((Date.now() - newestMs) / 1000)
      );
    }
  }

  const marketInternal = await collectMarketReadiness().catch(() => null);
  const market = marketInternal
    ? toPublicMarketReadiness(marketInternal)
    : {
        ready: false,
        status: "not_ready" as const,
        session: "unknown",
        checks: {
          providerConnected: "unknown" as const,
          symbolUniverseLoaded: "unknown" as const,
          previousSessionBaselinesLoaded: "unknown" as const,
          activeSnapshotPublished: "unknown" as const,
          redisReachable: "unknown" as const,
          databaseReachable: "unknown" as const,
          eventStreamWritable: "unknown" as const,
          workerHeartbeat: "unknown" as const,
        },
      };

  return NextResponse.json(
    {
      status: freshness.status,
      feedAgeSec: freshness.feedAgeSec,
      newestHeadlineAt,
      newestHeadlineAgeSec,
      scaleMode: health.scaleMode,
      wireCycleMs: health.wireCycleMs,
      feedItemCount: health.feedItemCount,
      feedUpdatedAt: health.feedUpdatedAt,
      feedSource: health.feedSource === "none" ? "none" : "ok",
      pipelineInFlight: health.pipelineInFlight,
      wireInFlight: health.wireInFlight,
      avgIngestDelaySec:
        avgIngestDelaySec != null ? Math.round(avgIngestDelaySec) : null,
      latencyMetric: latency?.metric ?? null,
      /** Sanitized aggregate — no snapshot ids, ages, or provider secrets. */
      market,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
