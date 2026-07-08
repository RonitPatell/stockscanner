import type { NewsArticle } from "@/types";

const SEC_USER_AGENT = "TrustTicker trustticker@trustticker.com";
const SEC_8K_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom";

let cikToTicker: Map<string, string> | null = null;
let cikMapLoadedAt = 0;
const CIK_CACHE_MS = 24 * 60 * 60 * 1000;

async function loadCikMap(): Promise<Map<string, string>> {
  if (cikToTicker && Date.now() - cikMapLoadedAt < CIK_CACHE_MS) {
    return cikToTicker;
  }

  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) return cikToTicker ?? new Map();

  const data = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  cikToTicker = new Map();
  for (const entry of Object.values(data)) {
    const padded = String(entry.cik_str).padStart(10, "0");
    cikToTicker.set(padded, entry.ticker.toUpperCase());
    cikToTicker.set(String(entry.cik_str), entry.ticker.toUpperCase());
  }
  cikMapLoadedAt = Date.now();
  return cikToTicker;
}

export async function fetchSec8KFilings(): Promise<NewsArticle[]> {
  try {
    const res = await fetch(SEC_8K_URL, {
      headers: { "User-Agent": SEC_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const cikMap = await loadCikMap();
    const articles: NewsArticle[] = [];

    for (const entry of entries) {
      const title =
        entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
      const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "";
      const updated = entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1];
      const cikMatch = title.match(/\((\d{6,10})\)/);
      if (!cikMatch || !updated) continue;

      const cik = cikMatch[1].padStart(10, "0");
      const symbol = cikMap.get(cik) ?? cikMap.get(cikMatch[1]);
      if (!symbol) continue;

      const cleanTitle = title.replace(/^8-K\s*-\s*/i, "").replace(/\s*\(\d+\)\s*\(Filer\)$/i, "");

      articles.push({
        id: `sec-8k-${cik}-${updated}`,
        symbol,
        headline: `8-K Filing: ${cleanTitle}`,
        source: "SEC EDGAR",
        url: link,
        publishedAt: new Date(updated),
        summary: "Material event disclosure (Form 8-K)",
      });
    }

    return articles;
  } catch {
    return [];
  }
}
