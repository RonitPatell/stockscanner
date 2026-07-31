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

  return NextResponse.json(
    {
      status: freshness.status,
      /** Cache rewrite age — prefer newestHeadlineAgeSec for “how old is news” */
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
