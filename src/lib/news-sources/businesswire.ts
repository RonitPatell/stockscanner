import type { NewsArticle } from "@/types";
import { resolveArticleSymbol, isNonStockArticle, articleIsAboutSymbol } from "../news-verifier";
import { fetchRssXml, hashStr, parseRssItems } from "./rss-utils";

const BUSINESS_WIRE_FEEDS = [
  "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtQ==",
  "https://feed.businesswire.com/rss/industry/1000001/feedTitle/Business%20Wire%20-%20Financial%20Services",
  "https://feed.businesswire.com/rss/industry/1000002/feedTitle/Business%20Wire%20-%20Technology",
  "https://feed.businesswire.com/rss/industry/1000003/feedTitle/Business%20Wire%20-%20Health",
  "https://feed.businesswire.com/rss/industry/1000005/feedTitle/Business%20Wire%20-%20Energy",
  "https://feed.businesswire.com/rss/industry/1000012/feedTitle/Business%20Wire%20-%20Consumer",
  "https://feed.businesswire.com/rss/subject/1000117/feedTitle/Business%20Wire%20-%20Earnings",
  "https://feed.businesswire.com/rss/subject/1000093/feedTitle/Business%20Wire%20-%20Mergers",
];

export async function fetchBusinessWirePRs(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const seen = new Set<string>();

  const results = await Promise.all(
    BUSINESS_WIRE_FEEDS.map(async (feedUrl) => {
      const xml = await fetchRssXml(feedUrl);
      if (!xml) return [] as NewsArticle[];
      const out: NewsArticle[] = [];
      for (const item of parseRssItems(xml)) {
        if (!item.title) continue;
        const key = item.link || item.title;
        if (seen.has(key)) continue;
        seen.add(key);

        const summary = item.description.slice(0, 400);
        if (isNonStockArticle(item.title, summary)) continue;

        const resolved = resolveArticleSymbol(item.title, summary);
        if (!resolved || !articleIsAboutSymbol(resolved.symbol, item.title, summary)) continue;

        out.push({
          id: `bw-${hashStr(key)}`,
          symbol: resolved.symbol,
          headline: item.title,
          source: "Business Wire",
          url: item.link || undefined,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          summary,
        });
      }
      return out;
    })
  );

  for (const batch of results) articles.push(...batch);
  return articles;
}
