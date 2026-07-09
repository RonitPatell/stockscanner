import { resolveFinnhubKey } from "./finnhub-key";
import type { CachedQuote } from "./quote-cache-service";

/** Symbols shown in market state that are not regular stock tickers. */
export const MARKET_INDEX_SYMBOLS = new Set(["VIX"]);

export function isQuotableMarketSymbol(symbol: string): boolean {
  return MARKET_INDEX_SYMBOLS.has(symbol.toUpperCase());
}

export function isQuotableSymbol(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  if (isQuotableMarketSymbol(sym)) return true;
  return /^[A-Z]{1,5}$/.test(sym) && sym !== "VIX";
}

async function fetchVixFromFinnhub(): Promise<CachedQuote | null> {
  const key = resolveFinnhubKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=%5EVIX&token=${encodeURIComponent(key)}`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) }
    );
    if (!res.ok) return null;
    const q = await res.json();
    if (!q?.c || q.c <= 0) return null;
    return { price: q.c, change: q.d ?? 0, changePercent: q.dp ?? 0 };
  } catch {
    return null;
  }
}

async function fetchVixFromYahoo(): Promise<CachedQuote | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d",
      {
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json,text/plain,*/*",
        },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; previousClose?: number } }[] };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prevClose = Number(meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) {
      return null;
    }
    const change = price - prevClose;
    return { price, change, changePercent: (change / prevClose) * 100 };
  } catch {
    return null;
  }
}

export async function fetchVixQuote(): Promise<CachedQuote | null> {
  return (await fetchVixFromFinnhub()) ?? (await fetchVixFromYahoo());
}
