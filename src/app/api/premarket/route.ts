import { NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { buildWatchlistBrief } from "@/lib/briefs";
import { getMarketSession } from "@/lib/market-scanner";
import { getCachedFeed } from "@/lib/feed-cache";

export const dynamic = "force-dynamic";

/** Premarket command center — gappers, overnight catalysts, brief */
export async function GET() {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const session = await auth();
  const { items: all } = await getCachedFeed("all");

  const gappers = all
    .filter(
      (c) =>
        (c.setupTags?.includes("gapper") ?? false) ||
        Math.abs(c.changePercent ?? 0) >= 5 ||
        (c.isPremarket ?? false)
    )
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, 15);

  const overnight = all
    .filter((c) => c.isPremarket || (c.setupTags?.includes("gapper") ?? false))
    .slice(0, 12);

  let brief = null;
  if (session?.user?.id) {
    try {
      brief = await buildWatchlistBrief(session.user.id, "morning");
    } catch {
      /* optional */
    }
  }

  return NextResponse.json({
    session: getMarketSession(),
    generatedAt: new Date().toISOString(),
    gappers,
    overnight,
    brief,
    totalCatalysts: all.length,
  });
}
