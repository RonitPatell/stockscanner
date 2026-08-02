import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCachedQuotes } from "@/lib/quote-cache-service";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

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
  workerOwned?: boolean;
};

async function buildFromQuoteCache(): Promise<MarketStatePayload> {
  const cached = await getCachedQuotes([...SYMBOLS, "VIX"]);
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
  const vix = cached.VIX;
  if (vix) quotes.VIX = vix;
  return {
    quotes,
    updatedAt: new Date().toISOString(),
    cached: true,
    workerOwned: true,
  };
}

/**
 * Index/sector tape — Redis quote cache only.
 * Never opens provider connections from user traffic.
 */
export async function GET() {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  try {
    if (last && Date.now() - last.ts < CACHE_MS) {
      return NextResponse.json(last.payload);
    }

    const payload = await buildFromQuoteCache();
    last = { ts: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Market state API error:", error);
    if (last) return NextResponse.json(last.payload);
    return NextResponse.json({
      quotes: {},
      updatedAt: new Date().toISOString(),
      workerOwned: true,
    });
  }
}
