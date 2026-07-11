import { prisma } from "./prisma";
import { getCachedQuotes } from "./quote-cache-service";
import { buildActionPlaybook } from "./action-playbook";

export interface AutopsyItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  ingestedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
  bias: string;
  antiFomoScore: number;
  lesson: string;
}

export interface WatchlistAutopsy {
  watchlist: string[];
  items: AutopsyItem[];
  hitCount: number;
  avgMoveAbs: number | null;
  message: string;
}

export async function getWatchlistAutopsy(
  watchlist: string[],
  hours = 24,
  limit = 15
): Promise<WatchlistAutopsy> {
  const symbols = [...new Set(watchlist.map((s) => s.toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) {
    return {
      watchlist: [],
      items: [],
      hitCount: 0,
      avgMoveAbs: null,
      message: "Add tickers to your watchlist to unlock autopsy — we show every hit you could have traded.",
    };
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.catalyst.findMany({
    where: {
      symbol: { in: symbols },
      publishedAt: { gte: since },
    },
    orderBy: { publishedAt: "desc" },
    take: 60,
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      publishedAt: true,
      createdAt: true,
      changePercent: true,
      catalystType: true,
      sentimentScore: true,
      setupTags: true,
      urgencyScore: true,
      relatedSymbols: true,
      floatShares: true,
    },
  });

  const quotes = await getCachedQuotes(symbols);

  const items: AutopsyItem[] = rows.slice(0, limit).map((r) => {
    const delaySec = Math.max(
      0,
      Math.round((r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
    );
    const change = quotes[r.symbol]?.changePercent ?? r.changePercent;
    const playbook = buildActionPlaybook({
      ...r,
      changePercent: change,
      rVol: null,
    });
    const move = change ?? 0;
    const lesson =
      playbook.bias === "avoid"
        ? "You were protected if you skipped — dilution/FOMO trap."
        : Math.abs(move) >= 3
          ? `Your name moved ${move >= 0 ? "+" : ""}${move.toFixed(1)}% — this is why watchlist alerts matter.`
          : "On your list; move was quiet — good filter, not every hit is a trade.";

    return {
      id: r.id,
      symbol: r.symbol,
      headline: r.headline,
      source: r.source,
      publishedAt: r.publishedAt.toISOString(),
      ingestedAt: r.createdAt.toISOString(),
      ingestDelaySec: delaySec,
      changePercent: change,
      bias: playbook.bias,
      antiFomoScore: playbook.antiFomoScore,
      lesson,
    };
  });

  const moves = items
    .map((i) => Math.abs(i.changePercent ?? 0))
    .filter((m) => m > 0);
  const avgMoveAbs =
    moves.length > 0
      ? Math.round((moves.reduce((a, b) => a + b, 0) / moves.length) * 10) / 10
      : null;

  return {
    watchlist: symbols,
    items,
    hitCount: items.length,
    avgMoveAbs,
    message:
      items.length === 0
        ? `No catalysts on your ${symbols.length} watchlist names in the last ${hours}h.`
        : `${items.length} watchlist hit${items.length === 1 ? "" : "s"} in ${hours}h` +
          (avgMoveAbs != null ? ` · avg |move| ${avgMoveAbs}%` : ""),
  };
}
