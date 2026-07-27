import type { NewsArticle } from "@/types";
import { resolveArticleSymbol, isNonStockArticle, articleIsAboutSymbol } from "../news-verifier";
import { fetchRssXml, hashStr, parseRssItems } from "./rss-utils";
import { stampFromRssPubDate } from "../latency-trace";

const GLOBE_FEEDS = [
  "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20on%20Public%20Companies",
  "https://www.globenewswire.com/RssFeed/subjectcode/21-Mergers%20and%20Acquisitions/feedTitle/GlobeNewswire%20-%20M%26A",
  "https://www.globenewswire.com/RssFeed/subjectcode/13-Earnings%20Releases%20and%20Operating%20Results/feedTitle/GlobeNewswire%20-%20Earnings",
  "https://www.globenewswire.com/RssFeed/subjectcode/5-Bankruptcy/feedTitle/GlobeNewswire%20-%20Bankruptcy",
  "https://www.globenewswire.com/RssFeed/subjectcode/8-Contracts/feedTitle/GlobeNewswire%20-%20Contracts",
  "https://www.globenewswire.com/RssFeed/subjectcode/14-Dividend%20Reports%20and%20Estimates/feedTitle/GlobeNewswire%20-%20Dividends",
  "https://www.globenewswire.com/RssFeed/subjectcode/23-Stock%20Market%20News/feedTitle/GlobeNewswire%20-%20Stock%20Market",
  "https://www.globenewswire.com/RssFeed/subjectcode/29-FDA%20Approval%20of%20Drugs%20and%20Devices/feedTitle/GlobeNewswire%20-%20FDA",
  "https://www.globenewswire.com/RssFeed/industry/all/orgclass/1/lang/en",
];

export async function fetchGlobeNewswirePRs(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const seen = new Set<string>();

  const results = await Promise.all(
    GLOBE_FEEDS.map(async (feedUrl) => {
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

        const stamp = stampFromRssPubDate(item.pubDate);
        out.push({
          id: `globe-${hashStr(key)}`,
          symbol: resolved.symbol,
          headline: item.title,
          source: "GlobeNewswire",
          url: item.link || undefined,
          publishedAt: stamp.publishedAt,
          summary,
          trace: { ...stamp.trace, providerItemId: `globe-${hashStr(key)}` },
        });
      }
      return out;
    })
  );

  for (const batch of results) articles.push(...batch);
  return articles;
}
