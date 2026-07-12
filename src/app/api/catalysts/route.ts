import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed, getFeedMeta } from "@/lib/feed-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const ROUTE_BUDGET_MS = 8_000;

async function withBudget<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ROUTE_BUDGET_MS)),
  ]);
}

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  try {
    const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
    const cacheKey = moversOnly ? "movers" : "all";
    const cached = await getCachedFeed(cacheKey);
    const [catalysts, meta] = await Promise.all([
      cached.items.length > 0
        ? Promise.resolve(cached.items.slice(0, 150))
        : withBudget(() => getCatalysts(150, { moversOnly }), []),
      withBudget(() => getFeedMeta(), cached.meta),
    ]);
    const items =
      catalysts.length > 0
        ? catalysts
        : cached.items.length > 0
          ? cached.items.slice(0, 150)
          : [];

    return NextResponse.json(items, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        "X-Feed-Updated": meta?.updatedAt ?? "",
      },
    });
  } catch (error) {
    console.error("Catalysts API error:", error);
    return NextResponse.json([], { status: 200 });
  }
}
