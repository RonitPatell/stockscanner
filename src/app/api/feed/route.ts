import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCachedFeed, getFeedMeta } from "@/lib/feed-cache";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Lightweight feed read — cache only, no DB. */
export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
  const key = moversOnly ? "movers" : "all";
  const { items, meta } = await getCachedFeed(key);
  const feedMeta = meta ?? (await getFeedMeta());

  return NextResponse.json({
    items,
    meta: feedMeta,
    scaleMode: isScaleMode(),
  });
}
