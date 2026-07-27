import type { NewsArticle } from "@/types";
import { resolveArticleSymbol, isNonStockArticle, articleIsAboutSymbol } from "../news-verifier";
import { isValidTickerFormat } from "../ticker-utils";
import { getNextTickerBatch } from "./active-tickers";
import { fetchRssXml, hashStr, parseRssItems } from "./rss-utils";
import { stampFromRssPubDate } from "../latency-trace";

/** Broad market/news RSS feeds — symbol resolved from headline when present */
const FAST_MARKET_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.benzinga.com/feed", source: "Benzinga" },
  { url: "https://feeds.marketwatch.com/marketwatch/marketpulse/", source: "MarketWatch" },
  { url: "https://www.cnbc.com/id/15839135/device/rss/rss.html", source: "CNBC" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
];

const SLOW_MARKET_FEEDS: { url: string; source: string }[] = [
  { url: "https://seekingalpha.com/market_currents.xml", source: "Seeking Alpha" },
  { url: "https://www.nasdaq.com/feed/rssoutbound?category=Stocks", source: "Nasdaq" },
  { url: "https://markets.businessinsider.com/rss/news", source: "Business Insider" },
];

const MARKET_FEEDS = [...FAST_MARKET_FEEDS, ...SLOW_MARKET_FEEDS];

async function fetchRssFeedBatch(
  feeds: { url: string; source: string }[],
  seen: Set<string>
): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  const results = await Promise.all(
    feeds.map(async ({ url, source }) => {
      const xml = await fetchRssXml(url);
      if (!xml) return [] as NewsArticle[];
      const out: NewsArticle[] = [];
      for (const item of parseRssItems(xml).slice(0, 40)) {
        if (!item.title) continue;
        const key = `${source}:${item.link || item.title}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const summary = item.description.slice(0, 400);
        if (isNonStockArticle(item.title, summary)) continue;

        const resolved = resolveArticleSymbol(item.title, summary);
        if (!resolved || !articleIsAboutSymbol(resolved.symbol, item.title, summary)) continue;

        const stamp = stampFromRssPubDate(item.pubDate);
        const id = `rss-${hashStr(key)}`;
        out.push({
          id,
          symbol: resolved.symbol,
          headline: item.title,
          source,
          url: item.link || undefined,
          publishedAt: stamp.publishedAt,
          summary,
          trace: { ...stamp.trace, providerItemId: id },
        });
      }
      return out;
    })
  );

  for (const batch of results) articles.push(...batch);
  return articles;
}

/** Benzinga + MarketWatch + CNBC — polled every few seconds */
export async function fetchFastMarketRssNews(): Promise<NewsArticle[]> {
  return fetchRssFeedBatch(FAST_MARKET_FEEDS, new Set());
}

export async function fetchSlowMarketRssNews(): Promise<NewsArticle[]> {
  return fetchRssFeedBatch(SLOW_MARKET_FEEDS, new Set());
}

export async function fetchMarketRssNews(): Promise<NewsArticle[]> {
  return fetchRssFeedBatch(MARKET_FEEDS, new Set());
}

/**
 * Yahoo Finance per-ticker RSS — symbol is known (StockTitan-style coverage for
 * actively rotating US names). Batches of 25 to stay responsive.
 */
export async function fetchYahooTickerNews(
  batchSize = 30,
  extraSymbols: string[] = []
): Promise<NewsArticle[]> {
  const rotated = getNextTickerBatch(batchSize).filter(isValidTickerFormat);
  const symbols = [
    ...new Set([...extraSymbols.map((s) => s.toUpperCase()), ...rotated]),
  ].filter(isValidTickerFormat);
  if (symbols.length === 0) return [];

  // Yahoo accepts comma-separated symbols
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 8) {
    chunks.push(symbols.slice(i, i + 8));
  }

  const articles: NewsArticle[] = [];
  const seen = new Set<string>();

  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${chunk.join(",")}&region=US&lang=en-US`;
      const xml = await fetchRssXml(url);
      if (!xml) return;
      for (const item of parseRssItems(xml)) {
        if (!item.title) continue;
        const key = item.link || item.title;
        if (seen.has(key)) continue;
        seen.add(key);

        // Prefer ticker named in headline; else map to a chunk symbol via $TICKER / (TICKER)
        const symbol =
          resolveArticleSymbol(item.title, item.description.slice(0, 300))?.symbol ?? "";
        if (!symbol || !isValidTickerFormat(symbol)) continue;
        if (!articleIsAboutSymbol(symbol, item.title, item.description.slice(0, 300))) continue;

        const stamp = stampFromRssPubDate(item.pubDate);
        const id = `yh-${hashStr(key)}`;
        articles.push({
          id,
          symbol,
          headline: item.title,
          source: "Yahoo Finance",
          url: item.link || undefined,
          publishedAt: stamp.publishedAt,
          summary: item.description.slice(0, 300),
          trace: { ...stamp.trace, providerItemId: id },
        });
      }
    })
  );

  return articles;
}
