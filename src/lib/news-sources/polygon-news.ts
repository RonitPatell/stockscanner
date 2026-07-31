import type { NewsArticle } from "@/types";
import {
  articleIsAboutSymbol,
  isNonStockArticle,
  resolveArticleSymbol,
} from "../news-verifier";
import { isValidTickerFormat } from "../ticker-utils";
import { stampFromRssPubDate } from "../latency-trace/annotate";

/**
 * Polygon / Massive reference news — optional paid enrichment.
 * Honest cadence: vendor docs list hourly update on Stocks plans (not a sub-second wire).
 * Env: POLYGON_API_KEY (or MASSIVE_API_KEY)
 */
function resolveKey(): string {
  return (
    process.env.POLYGON_API_KEY?.trim() ||
    process.env.MASSIVE_API_KEY?.trim() ||
    ""
  );
}

function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

interface PolygonNewsItem {
  id?: string;
  title?: string;
  description?: string;
  article_url?: string;
  published_utc?: string;
  tickers?: string[];
  publisher?: { name?: string };
}

export async function fetchPolygonNews(limit = 40): Promise<NewsArticle[]> {
  const key = resolveKey();
  if (!key) return [];

  const base =
    process.env.POLYGON_API_BASE?.trim() || "https://api.polygon.io";
  const url = new URL(`${base.replace(/\/$/, "")}/v2/reference/news`);
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, limit))));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "published_utc");
  url.searchParams.set("apiKey", key);

  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[polygon-news] HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { results?: PolygonNewsItem[] };
    const out: NewsArticle[] = [];
    const seen = new Set<string>();

    for (const item of data.results ?? []) {
      const title = (item.title || "").trim();
      if (!title) continue;
      const summary = (item.description || "").slice(0, 400);
      if (isNonStockArticle(title, summary)) continue;

      const tickers = (item.tickers || [])
        .map((t) => t.toUpperCase().replace(/[^A-Z.]/g, ""))
        .filter((t) => isValidTickerFormat(t));

      let symbol =
        resolveArticleSymbol(title, summary)?.symbol || tickers[0] || "";
      if (!symbol || !isValidTickerFormat(symbol)) continue;
      if (!articleIsAboutSymbol(symbol, title, summary)) {
        const hit = tickers.find((t) => articleIsAboutSymbol(t, title, summary));
        if (!hit) continue;
        symbol = hit;
      }

      const keyUrl = item.article_url || item.id || title;
      if (seen.has(keyUrl)) continue;
      seen.add(keyUrl);

      const stamp = stampFromRssPubDate(item.published_utc);
      const id = `poly-${hashId(keyUrl)}`;
      out.push({
        id,
        symbol,
        headline: title,
        source: item.publisher?.name || "Polygon News",
        url: item.article_url || undefined,
        publishedAt: stamp.publishedAt,
        summary,
        trace: { ...stamp.trace, providerItemId: id },
      });
    }
    return out;
  } catch (e) {
    console.error(
      "[polygon-news]",
      e instanceof Error ? e.message : "fetch failed"
    );
    return [];
  }
}

export function isPolygonNewsConfigured(): boolean {
  return Boolean(resolveKey());
}
