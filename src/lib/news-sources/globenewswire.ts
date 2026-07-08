import type { NewsArticle } from "@/types";
import { resolveArticleSymbol } from "../news-verifier";

const GLOBE_FEEDS = [
  "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20on%20Public%20Companies",
  "https://www.globenewswire.com/RssFeed/subjectcode/21-Mergers%20and%20Acquisitions/feedTitle/GlobeNewswire%20-%20M%26A",
  "https://www.globenewswire.com/RssFeed/subjectcode/13-Earnings%20Releases%20and%20Operating%20Results/feedTitle/GlobeNewswire%20-%20Earnings",
];

export async function fetchGlobeNewswirePRs(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  for (const feedUrl of GLOBE_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        cache: "no-store",
        headers: { "User-Agent": "TrustTicker/1.0 (trustticker.com)" },
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

      for (const item of items) {
        const title =
          item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] ||
          item.match(/<title>(.*?)<\/title>/)?.[1] ||
          "";
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || "";
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1];
        const description =
          item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || "";

        const resolved = resolveArticleSymbol(title, description.slice(0, 300));
        if (!resolved) continue;

        articles.push({
          id: `globe-${hashStr(link || title)}`,
          symbol: resolved.symbol,
          headline: title,
          source: "GlobeNewswire",
          url: link,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          summary: description.slice(0, 300),
        });
      }
    } catch { /* next feed */ }
  }

  return articles;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
