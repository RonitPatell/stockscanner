import { NextResponse } from "next/server";
import { resolveFinnhubKey } from "@/lib/finnhub-key";
import { fetchQuoteLive } from "@/lib/market-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

let inFlight: Promise<any> | null = null;
let last: { ts: number; payload: any } | null = null;
const CACHE_MS = 15_000;

const SYMBOLS = [
  // Indices
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  // Volatility proxy (kept as fallback when VIX is unavailable)
  "VIXY",
  // Key sectors / risk gauges
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
  // Semi gauge
  "SMH",
] as const;

async function fetchVixFromFinnhub(): Promise<
  { price: number; change: number; changePercent: number } | null
> {
  const key = resolveFinnhubKey();
  if (!key) return null;
  // Finnhub supports VIX as an index in many accounts via ^VIX
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=%5EVIX&token=${encodeURIComponent(key)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const q = await res.json();
    if (!q?.c || q.c <= 0) return null;
    return {
      price: q.c,
      change: q.d ?? 0,
      changePercent: q.dp ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchVixFromCboe(): Promise<
  { price: number; change: number; changePercent: number } | null
> {
  // Official Cboe daily history CSV (updated daily). We use the latest 2 closes.
  // https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv
  try {
    const res = await fetch(
      "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv",
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const csv = (await res.text()).trim();
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 3) return null;

    const parseClose = (line: string): number | null => {
      const cols = line.split(",");
      const close = Number(cols[4]);
      return Number.isFinite(close) && close > 0 ? close : null;
    };

    const close0 = parseClose(lines[1]);
    const close1 = parseClose(lines[2]);
    if (close0 == null || close1 == null) return null;
    const change = close0 - close1;
    const changePercent = (change / close1) * 100;
    return { price: close0, change, changePercent };
  } catch {
    return null;
  }
}

async function fetchVixFromYahoo(): Promise<
  { price: number; change: number; changePercent: number } | null
> {
  // Best-effort intraday spot VIX via Yahoo chart API (no key).
  // https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1m&range=1d",
      {
        cache: "no-store",
        headers: {
          // Yahoo often blocks requests without a UA
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "application/json,text/plain,*/*",
        },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prevClose = Number(meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) {
      return null;
    }
    const change = price - prevClose;
    const changePercent = (change / prevClose) * 100;
    return { price, change, changePercent };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    if (last && Date.now() - last.ts < CACHE_MS) {
      return NextResponse.json(last.payload);
    }
    if (inFlight) {
      const payload = await inFlight;
      return NextResponse.json(payload);
    }

    inFlight = (async () => {
      const key = resolveFinnhubKey();
      if (!key) {
        const payload = { quotes: {}, updatedAt: new Date().toISOString() };
        last = { ts: Date.now(), payload };
        return payload;
      }

    const quotes: Record<
      string,
      { price: number; changePercent: number; change: number }
    > = {};

      // Prefer intraday VIX (Finnhub → Yahoo intraday), else fall back to Cboe daily close.
      const vix =
        (await fetchVixFromFinnhub()) ??
        (await fetchVixFromYahoo()) ??
        (await fetchVixFromCboe());
      if (vix) {
        quotes.VIX = {
          price: vix.price,
          changePercent: vix.changePercent,
          change: vix.change,
        };
      }

      for (const symbol of SYMBOLS) {
        const q = await fetchQuoteLive(symbol);
        if (!q) continue;
        quotes[symbol] = {
          price: q.price,
          changePercent: q.changePercent,
          change: q.change,
        };
      }

      const payload = {
        quotes,
        updatedAt: new Date().toISOString(),
      };
      last = { ts: Date.now(), payload };
      return payload;
    })();

    const payload = await inFlight;
    inFlight = null;
    return NextResponse.json(payload);
  } catch (error) {
    inFlight = null;
    console.error("Market state API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market state" },
      { status: 500 }
    );
  }
}

