import type { NewsArticle } from "@/types";
import { stampFromUpdated } from "../latency-trace";
import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness";

const SEC_USER_AGENT_HEADER = SEC_USER_AGENT;

type SecFormKind = "8-K" | "4" | "424B5" | "S-1" | "S-1/A" | "S-3" | "S-3/A";

const SEC_ATOM_URLS: { form: SecFormKind; url: string; count: number }[] = [
  {
    form: "8-K",
    count: 100,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom",
  },
  {
    form: "4",
    count: 80,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=80&output=atom",
  },
  {
    form: "424B5",
    count: 40,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=424B5&count=40&output=atom",
  },
  {
    form: "S-1",
    count: 30,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&count=30&output=atom",
  },
  {
    form: "S-1/A",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1%2FA&count=20&output=atom",
  },
  {
    form: "S-3",
    count: 30,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-3&count=30&output=atom",
  },
  {
    form: "S-3/A",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-3%2FA&count=20&output=atom",
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
    headers: { "User-Agent": SEC_USER_AGENT_HEADER },
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
    case "S-1":
      return `S-1 registration: ${cleanTitle}`;
    case "S-1/A":
      return `S-1/A amendment: ${cleanTitle}`;
    case "S-3":
      return `S-3 shelf registration: ${cleanTitle}`;
    case "S-3/A":
      return `S-3/A amendment: ${cleanTitle}`;
  }
}

function formSummary(form: SecFormKind): string {
  switch (form) {
    case "8-K":
      return "Material event disclosure (Form 8-K)";
    case "4":
      return "Insider transaction (Form 4)";
    case "424B5":
      return "Prospectus supplement — often dilution / ATM / registered direct";
    case "S-1":
      return "Form S-1 registration statement — registration capacity, not a confirmed sale";
    case "S-1/A":
      return "S-1 amendment — review for changed capacity or terminated facilities";
    case "S-3":
      return "Form S-3 shelf registration — registration capacity, not a confirmed sale";
    case "S-3/A":
      return "S-3 amendment — review for changed capacity or terminated facilities";
  }
}

/** id-safe form slug for rawNewsId */
function formIdSlug(form: SecFormKind): string {
  return form.toLowerCase().replace(/\//g, "/");
}

async function fetchSecAtomForm(form: SecFormKind, url: string): Promise<NewsArticle[]> {
  try {
    const allowed = await waitForSecPermit(2_500);
    if (!allowed) return [];

    const res = await fetch(url, {
      headers: { "User-Agent": SEC_USER_AGENT_HEADER },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    const cikMap = await loadCikMap();
    const articles: NewsArticle[] = [];
    const formEsc = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
        .replace(new RegExp(`^${formEsc}\\s*-\\s*`, "i"), "")
        .replace(/\s*\(\d+\)\s*\(Filer\)$/i, "")
        .trim();

      const stamp = stampFromUpdated(updated);
      const id = `sec-${formIdSlug(form)}-${cik}-${updated}`;
      articles.push({
        id,
        symbol,
        headline: formHeadline(form, cleanTitle),
        source: "SEC EDGAR",
        url: link,
        publishedAt: stamp.publishedAt,
        summary: formSummary(form),
        trace: { ...stamp.trace, providerItemId: id },
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
 * SEC wire: 8-K + Form 4 + capital-markets forms (424B5, S-1, S-3 + amendments).
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
