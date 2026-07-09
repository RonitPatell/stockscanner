import type { NewsArticle } from "@/types";
import { resolveArticleSymbol, isNonStockArticle, articleIsAboutSymbol } from "../news-verifier";
import { fetchRssXml, hashStr, parseRssItems } from "./rss-utils";

/** PR Newswire public category RSS — primary StockTitan-style wire source */
const PRN_FEEDS = [
  "https://www.prnewswire.com/rss/news-releases-list.rss",
  "https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss",
  "https://www.prnewswire.com/rss/consumer-technology-latest-news/consumer-technology-latest-news-list.rss",
  "https://www.prnewswire.com/rss/health-care-hospitals-latest-news/health-care-hospitals-latest-news-list.rss",
  "https://www.prnewswire.com/rss/energy-latest-news/energy-latest-news-list.rss",
  "https://www.prnewswire.com/rss/automotive-transportation-latest-news/automotive-transportation-latest-news-list.rss",
  "https://www.prnewswire.com/rss/consumer-products-retail-latest-news/consumer-products-retail-latest-news-list.rss",
  "https://www.prnewswire.com/rss/industrial-technology-manufacturing-latest-news/industrial-technology-manufacturing-latest-news-list.rss",
  "https://www.prnewswire.com/rss/telecommunications-latest-news/telecommunications-latest-news-list.rss",
  "https://www.prnewswire.com/rss/medicine-pharmaceuticals-latest-news/medicine-pharmaceuticals-latest-news-list.rss",
];

export async function fetchPrNewswirePRs(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const seen = new Set<string>();

  const results = await Promise.all(
    PRN_FEEDS.map(async (feedUrl) => {
      const xml = await fetchRssXml(feedUrl);
      if (!xml) return [] as NewsArticle[];
      const out: NewsArticle[] = [];
      for (const item of parseRssItems(xml)) {
        if (!item.title) continue;
        const key = item.link || item.title;
        if (seen.has(key)) continue;
        seen.add(key);

        const summary = item.description.slice(0, 500);
        if (isNonStockArticle(item.title, summary)) continue;

        const resolved = resolveArticleSymbol(item.title, summary);
        if (!resolved || !articleIsAboutSymbol(resolved.symbol, item.title, summary)) continue;

        out.push({
          id: `prn-${hashStr(key)}`,
          symbol: resolved.symbol,
          headline: item.title,
          source: "PR Newswire",
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
