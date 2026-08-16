import { NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedQuotes } from "@/lib/quote-cache-service";
import { articleIsAboutSymbol } from "@/lib/news-verifier";

export const dynamic = "force-dynamic";

/** Today's watchlist session stats from ingested catalysts + live quotes */
export async function GET() {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { watchlist: true },
  });
  if (!user?.watchlist?.length) {
    return NextResponse.json({
      watchlist: [],
      storyCount: 0,
      movers: [],
      best: null,
      worst: null,
      avgSentiment: null,
    });
  }

  const symbols = user.watchlist.map((s) => s.toUpperCase());
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.catalyst.findMany({
    where: {
      symbol: { in: symbols },
      publishedAt: { gte: since },
    },
    orderBy: { publishedAt: "desc" },
    select: {
      symbol: true,
      headline: true,
      changePercent: true,
      sentimentScore: true,
      catalystType: true,
      publishedAt: true,
      setupTags: true,
    },
  });

  const verifiedRows = rows.filter((r) => articleIsAboutSymbol(r.symbol, r.headline));

  const quotes = await getCachedQuotes(symbols);
  const sessionMoves = symbols
    .map((symbol) => ({
      symbol,
      changePercent: quotes[symbol]?.changePercent ?? null,
    }))
    .filter((r) => r.changePercent != null);

  const gainers = [...sessionMoves]
    .filter((r) => (r.changePercent ?? 0) > 0)
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  const losers = [...sessionMoves]
    .filter((r) => (r.changePercent ?? 0) < 0)
    .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));

  const movers = verifiedRows
    .filter((r) => {
      const live = quotes[r.symbol]?.changePercent;
      const chg = live ?? r.changePercent ?? 0;
      return Math.abs(chg) >= 1;
    })
    .sort((a, b) => {
      const aChg = Math.abs(quotes[a.symbol]?.changePercent ?? a.changePercent ?? 0);
      const bChg = Math.abs(quotes[b.symbol]?.changePercent ?? b.changePercent ?? 0);
      return bChg - aChg;
    });

  const sentiments = verifiedRows
    .map((r) => r.sentimentScore)
    .filter((s): s is number => s != null);
  const avgSentiment =
    sentiments.length > 0
      ? Math.round((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) * 10) / 10
      : null;

  return NextResponse.json({
    watchlist: symbols,
    storyCount: verifiedRows.length,
    movers: movers.slice(0, 8).map((r) => ({
      symbol: r.symbol,
      headline: r.headline,
      changePercent: quotes[r.symbol]?.changePercent ?? r.changePercent,
      catalystType: r.catalystType,
      setupTags: r.setupTags,
    })),
    best: gainers[0] ?? null,
    worst: losers[0] ?? null,
    avgSentiment,
  });
}
