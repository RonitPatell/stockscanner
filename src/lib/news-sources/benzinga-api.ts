import type { NewsArticle } from "@/types";
import { hashStr } from "./rss-utils";

/**
 * Optional Benzinga Cloud News API — the affordable path to true low-latency wire.
 * Set BENZINGA_API_KEY (sales/trial from benzinga.com/apis). Without it, we use free RSS.
 *
 * Free Basic tier (link-back) may work with limited fields; premium is sales-quoted.
 * Typical Essential desk access is often cited ~$150–200/mo — cheapest real "seconds" wire.
 */
export async function fetchBenzingaApiNews(limit = 40): Promise<NewsArticle[]> {
  const key = process.env.BENZINGA_API_KEY?.trim();
  if (!key) return [];

  const base =
    process.env.BENZINGA_API_BASE?.trim() ||
    "https://api.benzinga.com/api/v2/news";

  try {
    const url = new URL(base);
    url.searchParams.set("token", key);
    url.searchParams.set("pageSize", String(Math.min(100, limit)));
    url.searchParams.set("displayOutput", "headline");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as unknown;
    const rows = Array.isArray(data) ? data : [];
    const out: NewsArticle[] = [];

    for (const row of rows.slice(0, limit)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const headline = String(r.title ?? r.headline ?? "").trim();
      if (!headline) continue;

      const stocks = Array.isArray(r.stocks)
        ? (r.stocks as { name?: string }[])
            .map((s) => String(s?.name ?? "").toUpperCase())
            .filter(Boolean)
        : [];
      const symbol = stocks[0] || "SPY";
      const created =
        typeof r.created === "string"
          ? new Date(r.created)
          : typeof r.updated === "string"
            ? new Date(r.updated)
            : new Date();
      const idRaw = String(r.id ?? r.url ?? headline);
      const link = typeof r.url === "string" ? r.url : undefined;

      out.push({
        id: `bz:${hashStr(idRaw)}`,
        symbol: symbol.slice(0, 5),
        headline: headline.slice(0, 280),
        source: "Benzinga API",
        url: link,
        publishedAt: Number.isFinite(created.getTime()) ? created : new Date(),
        summary:
          typeof r.teaser === "string"
            ? r.teaser.slice(0, 400)
            : typeof r.body === "string"
              ? r.body.slice(0, 400)
              : undefined,
      });
    }

    return out;
  } catch {
    return [];
  }
}
