import { prisma } from "./prisma";
import { analyzeNews } from "./ai";
import {
  fetchMarketNews,
  fetchQuote,
  fetchQuoteTrusted,
  fetchVolumeForSymbol,
  estimateHistoricalMove,
  isPlaceholderQuote,
  isValidTickerFormat,
  isTrustedNewsSource,
  TICKER_BLACKLIST,
} from "./market-data";
import { refreshCatalystQuotes } from "./catalyst-quotes";
import { computeRvol } from "./volume-utils";
import { verifyNewsArticle, isKnownFalsePositive } from "./news-verifier";
import { isMoverCatalyst } from "./movers";
import { dispatchWatchlistAlerts } from "./watchlist-alerts";
import { groupCatalystsBySymbol } from "./group-catalysts";
import type { CatalystItem } from "@/types";

let lastIngestTime = 0;
let lastPurgeTime = 0;
let ingestInProgress = false;
const INGEST_INTERVAL_MS = 60 * 1000;
const MAX_INGEST_BATCH = 50;
const MAX_CATALYSTS_SHOWN = 80;

function isDisplayableCatalyst(c: CatalystItem): boolean {
  return (
    isValidTickerFormat(c.symbol) &&
    !isKnownFalsePositive(c.symbol, c.headline) &&
    c.price != null &&
    !isPlaceholderQuote(c.price, c.changePercent)
  );
}

async function purgeInvalidCatalysts(): Promise<void> {
  try {
    await prisma.catalyst.deleteMany({
      where: { symbol: { in: [...TICKER_BLACKLIST] } },
    });

    const ambiguous = await prisma.catalyst.findMany({
      where: { symbol: { in: ["ICE", "US", "CAN", "ON", "FOR", "ALL", "NEW", "TV"] } },
      select: { id: true, symbol: true, headline: true, aiSummary: true },
      take: 200,
    });
    const badIds = ambiguous
      .filter((c) => isKnownFalsePositive(c.symbol, c.headline, c.aiSummary ?? undefined))
      .map((c) => c.id);
    if (badIds.length > 0) {
      await prisma.catalyst.deleteMany({ where: { id: { in: badIds } } });
    }

    if (process.env.FINNHUB_API_KEY) {
      await prisma.catalyst.deleteMany({
        where: { source: { in: ["Yahoo Finance", "Yahoo"] } },
      });
    }
    await prisma.catalyst.deleteMany({
      where: {
        source: "SEC EDGAR",
        publishedAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      },
    });
    await prisma.catalyst.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
    });
  } catch { /* ignore */ }
}

export async function ingestAndAnalyzeNews(): Promise<CatalystItem[]> {
  const news = await fetchMarketNews();
  const results: CatalystItem[] = [];
  const quoteCache = new Map<string, Awaited<ReturnType<typeof fetchQuote>>>();

  const getQuote = async (symbol: string, articleId: string, source: string) => {
    const cached = quoteCache.get(symbol);
    if (cached !== undefined) return cached;
    const trusted =
      articleId.startsWith("fh-") ||
      articleId.startsWith("sec-") ||
      articleId.startsWith("globe-") ||
      articleId.startsWith("bw-") ||
      isTrustedNewsSource(source);
    const q = trusted
      ? (await fetchQuoteTrusted(symbol)) ?? (await fetchQuote(symbol))
      : await fetchQuote(symbol);
    quoteCache.set(symbol, q);
    return q;
  };

  const newItems: CatalystItem[] = [];

  for (const article of news.slice(0, MAX_INGEST_BATCH)) {
    try {
      const verified = await verifyNewsArticle(
        article.headline,
        article.summary,
        undefined,
        article.symbol
      );
      if (!verified.valid) continue;

      const symbol = verified.symbol;
      const quote = await getQuote(symbol, article.id, article.source);
      if (!quote) continue;

      const volStats = await fetchVolumeForSymbol(symbol);

      const analysis = await analyzeNews(
        symbol,
        article.headline,
        article.source,
        article.summary
      );

      const existing = await prisma.catalyst.findUnique({
        where: { rawNewsId: article.id },
      });

      if (existing) {
        const updated = await prisma.catalyst.update({
          where: { id: existing.id },
          data: {
            symbol,
            price: quote.price,
            changePercent: quote.changePercent,
            volume: volStats?.volume ?? existing.volume,
            avgVolume: volStats?.avgVolume ?? existing.avgVolume,
            marketCap: quote.marketCap,
            floatShares: quote.floatShares,
            aiSummary: analysis.summary,
            sentimentScore: analysis.sentimentScore,
            sentimentLabel: analysis.sentimentLabel,
            catalystType: analysis.catalystType,
            urgencyScore: analysis.urgencyScore,
          },
        });
        results.push(mapCatalyst(updated));
        continue;
      }

      const historical = estimateHistoricalMove(analysis.catalystType);

      const catalyst = await prisma.catalyst.create({
        data: {
          symbol,
          headline: article.headline,
          source: article.source,
          sourceUrl: article.url,
          publishedAt: article.publishedAt,
          rawNewsId: article.id,
          aiSummary: analysis.summary,
          sentimentScore: analysis.sentimentScore,
          sentimentLabel: analysis.sentimentLabel,
          catalystType: analysis.catalystType,
          urgencyScore: analysis.urgencyScore,
          floatShares: quote.floatShares,
          marketCap: quote.marketCap,
          price: quote.price,
          changePercent: quote.changePercent,
          volume: volStats?.volume ?? null,
          avgVolume: volStats?.avgVolume ?? null,
          historicalAvgMove: historical.avgMove,
          historicalSampleSize: historical.sampleSize,
          isPremarket: isPremarketHours(),
        },
      });

      results.push(mapCatalyst(catalyst));
      newItems.push(mapCatalyst(catalyst));
    } catch {
      /* skip article */
    }
  }

  lastIngestTime = Date.now();

  if (newItems.length > 0) {
    void dispatchWatchlistAlerts(newItems).catch(() => {});
  }

  return rankMovers(
    results.filter(isDisplayableCatalyst),
    true
  );
}

export async function getCatalysts(
  limit = MAX_CATALYSTS_SHOWN,
  options: { moversOnly?: boolean } = {}
): Promise<CatalystItem[]> {
  const moversOnly = options.moversOnly === true;
  const needsRefresh = Date.now() - lastIngestTime > INGEST_INTERVAL_MS;

  try {
    if (Date.now() - lastPurgeTime > 5 * 60_000) {
      await purgeInvalidCatalysts();
      lastPurgeTime = Date.now();
    }

    const catalysts = await prisma.catalyst.findMany({
      where: { price: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: limit * 4,
    });

    if (needsRefresh && !ingestInProgress) {
      ingestInProgress = true;
      if (catalysts.length === 0) {
        try {
          const results = await ingestAndAnalyzeNews();
          return rankMovers(results.filter(isDisplayableCatalyst), moversOnly).slice(0, limit);
        } finally {
          ingestInProgress = false;
          lastIngestTime = Date.now();
        }
      }
      void ingestAndAnalyzeNews().finally(() => {
        ingestInProgress = false;
        lastIngestTime = Date.now();
      });
    }

    let items = catalysts.map(mapCatalyst).filter(isDisplayableCatalyst);
    items = attachRvol(items);
    items = rankMovers(items, moversOnly);
    const result = items.slice(0, limit);

    // Refresh top symbols in background — never block the API response
    void refreshCatalystQuotes(result, 5).catch(() => {});

    return result;
  } catch {
    return ingestAndAnalyzeNews();
  }
}

function rankMovers(items: CatalystItem[], moversOnly: boolean): CatalystItem[] {
  const filtered = moversOnly ? items.filter(isMoverCatalyst) : items;
  return groupCatalystsBySymbol(filtered);
}

function attachRvol(items: CatalystItem[]): CatalystItem[] {
  return items.map((c) => ({
    ...c,
    rVol: computeRvol(c.volume, c.avgVolume) ?? c.rVol ?? null,
  }));
}

function mapCatalyst(c: {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: Date;
  aiSummary: string | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  floatShares: number | null;
  marketCap: number | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  avgVolume: number | null;
  isPremarket: boolean;
  historicalAvgMove: number | null;
  historicalSampleSize: number | null;
  catalystType: string | null;
  urgencyScore: number | null;
}): CatalystItem {
  return {
    id: c.id,
    symbol: c.symbol,
    headline: c.headline,
    source: c.source,
    sourceUrl: c.sourceUrl,
    publishedAt: c.publishedAt.toISOString(),
    aiSummary: c.aiSummary,
    sentimentScore: c.sentimentScore,
    sentimentLabel: c.sentimentLabel,
    floatShares: c.floatShares,
    marketCap: c.marketCap,
    price: c.price,
    changePercent: c.changePercent,
    volume: c.volume,
    avgVolume: c.avgVolume,
    rVol: computeRvol(c.volume, c.avgVolume),
    isPremarket: c.isPremarket,
    historicalAvgMove: c.historicalAvgMove,
    historicalSampleSize: c.historicalSampleSize,
    catalystType: c.catalystType,
    urgencyScore: c.urgencyScore,
  };
}

function isPremarketHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const time = hours * 60 + minutes;
  return time >= 240 && time < 570;
}
