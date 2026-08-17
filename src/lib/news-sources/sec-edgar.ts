import type { NewsArticle } from "@/types";
import { stampFromUpdated } from "../latency-trace";
import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness";
import { secFormIdSlug } from "../company-events/forms.ts";

const SEC_USER_AGENT_HEADER = SEC_USER_AGENT;

/**
 * Forms polled via EDGAR current Atom feeds.
 * Classifier supports additional forms when they arrive via other paths.
 */
type SecFormKind =
  | "8-K"
  | "10-Q"
  | "10-K"
  | "NT 10-Q"
  | "NT 10-K"
  | "4"
  | "3"
  | "5"
  | "144"
  | "424B5"
  | "S-1"
  | "S-1/A"
  | "S-3"
  | "S-3/A"
  | "EFFECT"
  | "DEF 14A"
  | "SC 13D"
  | "SC 13D/A"
  | "SC 13G"
  | "SC 13G/A"
  | "13F-HR";

const SEC_ATOM_URLS: { form: SecFormKind; url: string; count: number }[] = [
  {
    form: "8-K",
    count: 80,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=80&output=atom",
  },
  {
    form: "10-Q",
    count: 40,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-Q&count=40&output=atom",
  },
  {
    form: "10-K",
    count: 30,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&count=30&output=atom",
  },
  {
    form: "NT 10-Q",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=NT%2010-Q&count=20&output=atom",
  },
  {
    form: "NT 10-K",
    count: 15,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=NT%2010-K&count=15&output=atom",
  },
  {
    form: "4",
    count: 60,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&count=60&output=atom",
  },
  {
    form: "3",
    count: 30,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=3&count=30&output=atom",
  },
  {
    form: "5",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=5&count=20&output=atom",
  },
  {
    form: "144",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=144&count=25&output=atom",
  },
  {
    form: "424B5",
    count: 30,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=424B5&count=30&output=atom",
  },
  {
    form: "S-1",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&count=25&output=atom",
  },
  {
    form: "S-1/A",
    count: 15,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1%2FA&count=15&output=atom",
  },
  {
    form: "S-3",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-3&count=25&output=atom",
  },
  {
    form: "S-3/A",
    count: 15,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-3%2FA&count=15&output=atom",
  },
  {
    form: "EFFECT",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=EFFECT&count=20&output=atom",
  },
  {
    form: "DEF 14A",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=DEF%2014A&count=25&output=atom",
  },
  {
    form: "SC 13D",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013D&count=25&output=atom",
  },
  {
    form: "SC 13D/A",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013D%2FA&count=20&output=atom",
  },
  {
    form: "SC 13G",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013G&count=25&output=atom",
  },
  {
    form: "SC 13G/A",
    count: 20,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SC%2013G%2FA&count=20&output=atom",
  },
  {
    form: "13F-HR",
    count: 25,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&count=25&output=atom",
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
    case "10-Q":
      return `10-Q Filing: ${cleanTitle}`;
    case "10-K":
      return `10-K Filing: ${cleanTitle}`;
    case "NT 10-Q":
      return `NT 10-Q (late quarterly): ${cleanTitle}`;
    case "NT 10-K":
      return `NT 10-K (late annual): ${cleanTitle}`;
    case "4":
      return `Form 4 (insider): ${cleanTitle}`;
    case "3":
      return `Form 3 (initial ownership): ${cleanTitle}`;
    case "5":
      return `Form 5 (annual insider): ${cleanTitle}`;
    case "144":
      return `Form 144 (proposed sale): ${cleanTitle}`;
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
    case "EFFECT":
      return `EFFECT notice: ${cleanTitle}`;
    case "DEF 14A":
      return `DEF 14A proxy: ${cleanTitle}`;
    case "SC 13D":
      return `Schedule 13D: ${cleanTitle}`;
    case "SC 13D/A":
      return `Schedule 13D/A: ${cleanTitle}`;
    case "SC 13G":
      return `Schedule 13G: ${cleanTitle}`;
    case "SC 13G/A":
      return `Schedule 13G/A: ${cleanTitle}`;
    case "13F-HR":
      return `Form 13F-HR (institutional filings): ${cleanTitle}`;
  }
}

function formSummary(form: SecFormKind): string {
  switch (form) {
    case "8-K":
      return "Material event disclosure (Form 8-K)";
    case "10-Q":
      return "Quarterly report (Form 10-Q)";
    case "10-K":
      return "Annual report (Form 10-K)";
    case "NT 10-Q":
      return "Notification of late filing — Form 10-Q";
    case "NT 10-K":
      return "Notification of late filing — Form 10-K";
    case "4":
      return "Insider transaction (Form 4)";
    case "3":
      return "Initial statement of beneficial ownership (Form 3)";
    case "5":
      return "Annual statement of beneficial ownership (Form 5)";
    case "144":
      return "Notice of proposed sale of securities (Form 144)";
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
    case "EFFECT":
      return "Notice of effectiveness — registration declared effective";
    case "DEF 14A":
      return "Definitive proxy statement (DEF 14A)";
    case "SC 13D":
      return "Beneficial ownership report — Schedule 13D";
    case "SC 13D/A":
      return "Amendment to Schedule 13D";
    case "SC 13G":
      return "Beneficial ownership report — Schedule 13G";
    case "SC 13G/A":
      return "Amendment to Schedule 13G";
    case "13F-HR":
      return "Institutional holdings report (Form 13F) — delayed period data, not real-time";
  }
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
      const id = `sec-${secFormIdSlug(form)}-${cik}-${updated}`;
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
 * SEC wire: primary disclosure forms for Company Event Engine + Dilution.
 * Cached ~6s so a 2s ingest worker stays polite to EDGAR.
 * Aggregate RPS still enforced by sec-politeness.
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
