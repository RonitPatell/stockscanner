import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { getCachedFeed, getFeedMeta } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";
import { collapseStoryClusters } from "@/lib/story-cluster";

export const dynamic = "force-dynamic";

/** Lightweight feed read — cache only, no DB. */
export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const key = moversOnly ? "movers" : "all";
  const { items, meta } = await getCachedFeed(key);
  const feedMeta = meta ?? (await getFeedMeta());

  return NextResponse.json({
    items: collapseStoryClusters(items),
    meta: feedMeta,
    scaleMode: isScaleMode(),
  });
}
