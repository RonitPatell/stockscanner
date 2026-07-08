import { NextResponse } from "next/server";
import { fetchMarketNews } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dev probe: how many stock articles each source returns right now */
export async function GET() {
  const articles = await fetchMarketNews({ fast: true });
  const bySource = new Map<string, number>();
  for (const a of articles) {
    bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);
  }
  return NextResponse.json({
    total: articles.length,
    sources: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
    sample: articles.slice(0, 8).map((a) => ({
      symbol: a.symbol,
      source: a.source,
      headline: a.headline.slice(0, 90),
      ageMin: Math.round((Date.now() - a.publishedAt.getTime()) / 60_000),
    })),
  });
}
