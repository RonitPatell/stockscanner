import { prisma } from "./prisma";
import { analyzeNews } from "./ai";
import { fetchMarketNews, fetchQuote, estimateHistoricalMove } from "./market-data";
import type { CatalystItem } from "@/types";

// Auto-refresh news every 2 min when users are on the dashboard (no paid cron needed)
let lastIngestTime = 0;
const INGEST_INTERVAL_MS = 2 * 60 * 1000;

export async function ingestAndAnalyzeNews(): Promise<CatalystItem[]> {
  const news = await fetchMarketNews();
  const results: CatalystItem[] = [];

  for (const article of news.slice(0, 12)) {
    if (!article.symbol) continue;

    try {
      const existing = await prisma.catalyst.findUnique({
        where: { rawNewsId: article.id },
      });
      if (existing) {
        results.push(mapCatalyst(existing));
        continue;
      }

      const [analysis, quote] = await Promise.all([
        analyzeNews(article.symbol, article.headline, article.source, article.summary),
        fetchQuote(article.symbol),
      ]);

      const historical = estimateHistoricalMove(analysis.catalystType);

      const catalyst = await prisma.catalyst.create({
        data: {
          symbol: article.symbol,
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
          floatShares: quote?.floatShares,
          marketCap: quote?.marketCap,
          price: quote?.price,
          changePercent: quote?.changePercent,
          volume: quote?.volume,
          historicalAvgMove: historical.avgMove,
          historicalSampleSize: historical.sampleSize,
          isPremarket: isPremarketHours(),
        },
      });

      results.push(mapCatalyst(catalyst));
    } catch {
      // DB unavailable — return in-memory result
      const analysis = await analyzeNews(article.symbol, article.headline, article.source, article.summary);
      const quote = await fetchQuote(article.symbol);
      const historical = estimateHistoricalMove(analysis.catalystType);
      results.push({
        id: article.id,
        symbol: article.symbol,
        headline: article.headline,
        source: article.source,
        sourceUrl: article.url,
        publishedAt: article.publishedAt.toISOString(),
        aiSummary: analysis.summary,
        sentimentScore: analysis.sentimentScore,
        sentimentLabel: analysis.sentimentLabel,
        catalystType: analysis.catalystType,
        urgencyScore: analysis.urgencyScore,
        floatShares: quote?.floatShares,
        marketCap: quote?.marketCap,
        price: quote?.price,
        changePercent: quote?.changePercent,
        volume: quote?.volume,
        historicalAvgMove: historical.avgMove,
        historicalSampleSize: historical.sampleSize,
        isPremarket: isPremarketHours(),
      });
    }
  }

  lastIngestTime = Date.now();
  return results.sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0));
}

export async function getCatalysts(limit = 50): Promise<CatalystItem[]> {
  const needsRefresh = Date.now() - lastIngestTime > INGEST_INTERVAL_MS;

  try {
    const catalysts = await prisma.catalyst.findMany({
      orderBy: [{ urgencyScore: "desc" }, { publishedAt: "desc" }],
      take: limit,
    });

    if (catalysts.length === 0 || needsRefresh) {
      return ingestAndAnalyzeNews();
    }

    return catalysts.map(mapCatalyst);
  } catch {
    return ingestAndAnalyzeNews();
  }
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
