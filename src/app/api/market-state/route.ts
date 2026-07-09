import { NextResponse } from "next/server";
import { resolveFinnhubKey } from "@/lib/finnhub-key";
import { fetchQuoteLive } from "@/lib/market-data";
import { getCachedQuotes } from "@/lib/quote-cache-service";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let inFlight: Promise<MarketStatePayload> | null = null;
let last: { ts: number; payload: MarketStatePayload } | null = null;
const CACHE_MS = 30_000;

const SYMBOLS = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "VIXY",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLY",
  "XLP",
  "XLC",
  "XLU",
  "XLB",
  "SMH",
] as const;

type QuoteRow = { price: number; changePercent: number; change: number };
type MarketStatePayload = {
  quotes: Record<string, QuoteRow>;
  updatedAt: string;
  cached?: boolean;
};

async function fetchVixFromFinnhub(): Promise<QuoteRow | null> {
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

async function fetchVixFromYahoo(): Promise<QuoteRow | null> {
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

async function buildFromQuoteCache(): Promise<MarketStatePayload> {
  const cached = await getCachedQuotes([...SYMBOLS]);
  const quotes: Record<string, QuoteRow> = {};
  for (const symbol of SYMBOLS) {
    const q = cached[symbol];
    if (!q) continue;
    quotes[symbol] = {
      price: q.price,
      changePercent: q.changePercent,
      change: q.change,
    };
  }
  return { quotes, updatedAt: new Date().toISOString(), cached: true };
}

async function refreshLiveMarketState(): Promise<MarketStatePayload> {
  const key = resolveFinnhubKey();
  if (!key) {
    return { quotes: {}, updatedAt: new Date().toISOString() };
  }

  const quotes: Record<string, QuoteRow> = {};

  const vix = (await fetchVixFromFinnhub()) ?? (await fetchVixFromYahoo());
  if (vix) quotes.VIX = vix;

  for (const symbol of SYMBOLS) {
    const q = await fetchQuoteLive(symbol);
    if (!q) continue;
    quotes[symbol] = {
      price: q.price,
      changePercent: q.changePercent,
      change: q.change,
    };
  }

  return { quotes, updatedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    if (last && Date.now() - last.ts < CACHE_MS) {
      return NextResponse.json(last.payload);
    }

    const cachedPayload = await buildFromQuoteCache();
    if (Object.keys(cachedPayload.quotes).length >= 4) {
      last = { ts: Date.now(), payload: cachedPayload };
      if (!inFlight) {
        inFlight = refreshLiveMarketState()
          .then((payload) => {
            if (Object.keys(payload.quotes).length > 0) {
              last = { ts: Date.now(), payload };
            }
            return payload;
          })
          .finally(() => {
            inFlight = null;
          });
      }
      return NextResponse.json(cachedPayload);
    }

    if (last) {
      void refreshLiveMarketState().then((payload) => {
        if (Object.keys(payload.quotes).length > 0) {
          last = { ts: Date.now(), payload };
        }
      });
      return NextResponse.json(last.payload);
    }

    if (!inFlight) {
      inFlight = refreshLiveMarketState().finally(() => {
        inFlight = null;
      }) as Promise<MarketStatePayload>;
    }

    const payload = await Promise.race([
      inFlight,
      new Promise<MarketStatePayload>((resolve) =>
        setTimeout(
          () => resolve({ quotes: {}, updatedAt: new Date().toISOString() }),
          2_500
        )
      ),
    ]);

    if (Object.keys(payload.quotes).length > 0) {
      last = { ts: Date.now(), payload };
    }

    return NextResponse.json(payload);
  } catch (error) {
    inFlight = null;
    console.error("Market state API error:", error);
    if (last) return NextResponse.json(last.payload);
    return NextResponse.json({ quotes: {}, updatedAt: new Date().toISOString() });
  }
}
