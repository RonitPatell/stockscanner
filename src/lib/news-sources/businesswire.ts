import type { NewsArticle } from "@/types";
import { resolveArticleSymbol } from "../news-verifier";

const BUSINESS_WIRE_FEEDS = [
  "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtQ==",
  "https://feed.businesswire.com/rss/industry/1000001/feedTitle/Business%20Wire%20-%20Financial%20Services",
  "https://feed.businesswire.com/rss/industry/1000002/feedTitle/Business%20Wire%20-%20Technology",
  "https://feed.businesswire.com/rss/industry/1000003/feedTitle/Business%20Wire%20-%20Health",
];

export async function fetchBusinessWirePRs(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];

  for (const feedUrl of BUSINESS_WIRE_FEEDS) {
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
        const pubDate =
          item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ||
          item.match(/<dc:date>(.*?)<\/dc:date>/)?.[1];
        const description =
          item.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] ||
          item.match(/<description>(.*?)<\/description>/)?.[1] ||
          "";

        const resolved = resolveArticleSymbol(title, stripHtml(description));
        if (!resolved) continue;

        articles.push({
          id: `bw-${hashStr(link || title)}`,
          symbol: resolved.symbol,
          headline: title,
          source: "Business Wire",
          url: link,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          summary: stripHtml(description).slice(0, 400),
        });
      }
    } catch { /* next feed */ }
  }

  return articles;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
