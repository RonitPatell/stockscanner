import type { NewsArticle } from "@/types";

const SEC_USER_AGENT = "TrustTicker trustticker@trustticker.com";

type SecFormKind = "8-K" | "4" | "424B5";

const SEC_ATOM_URLS: { form: SecFormKind; url: string }[] = [
  {
    form: "8-K",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom",
  },
  {
    form: "4",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=80&output=atom",
  },
  {
    form: "424B5",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=424B5&count=40&output=atom",
  },
];

let cikToTicker: Map<string, string> | null = null;
let cikMapLoadedAt = 0;
const CIK_CACHE_MS = 24 * 60 * 60 * 1000;

let secWireCache: { articles: NewsArticle[]; ts: number } | null = null;
const SEC_WIRE_CACHE_MS = 6_000;

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

function formHeadline(form: SecFormKind, cleanTitle: string): string {
  switch (form) {
    case "8-K":
      return `8-K Filing: ${cleanTitle}`;
    case "4":
      return `Form 4 (insider): ${cleanTitle}`;
    case "424B5":
      return `424B5 prospectus: ${cleanTitle}`;
  }
}

function formSummary(form: SecFormKind): string {
  switch (form) {
    case "8-K":
      return "Material event disclosure (Form 8-K)";
    case "4":
      return "Insider transaction (Form 4)";
    case "424B5":
      return "Prospectus supplement — often dilution / ATM related";
  }
}

async function fetchSecAtomForm(form: SecFormKind, url: string): Promise<NewsArticle[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
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

      const cleanTitle = title
        .replace(new RegExp(`^${form}\\s*-\\s*`, "i"), "")
        .replace(/\s*\(\d+\)\s*\(Filer\)$/i, "")
        .trim();

      articles.push({
        id: `sec-${form.toLowerCase()}-${cik}-${updated}`,
        symbol,
        headline: formHeadline(form, cleanTitle),
        source: "SEC EDGAR",
        url: link,
        publishedAt: new Date(updated),
        summary: formSummary(form),
      });
    }

    return articles;
  } catch {
    return [];
  }
}

/** 8-K only — used by full market pull / movers helpers */
export async function fetchSec8KFilings(): Promise<NewsArticle[]> {
  const cfg = SEC_ATOM_URLS.find((x) => x.form === "8-K")!;
  return fetchSecAtomForm(cfg.form, cfg.url);
}

/**
 * StockTitan-style free SEC wire: 8-K + Form 4 + 424B5.
 * Cached ~6s so a 2s ingest worker stays polite to EDGAR.
 */
export async function fetchSecWireFilings(): Promise<NewsArticle[]> {
  if (secWireCache && Date.now() - secWireCache.ts < SEC_WIRE_CACHE_MS) {
    return secWireCache.articles;
  }

  const batches = await Promise.all(
    SEC_ATOM_URLS.map(({ form, url }) => fetchSecAtomForm(form, url))
  );
  const articles = batches.flat();
  secWireCache = { articles, ts: Date.now() };
  return articles;
}
