import { NextRequest, NextResponse } from "next/server";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { resolveFinnhubKey } from "@/lib/finnhub-key";
import { getCachedQuotes, refreshQuoteCache } from "@/lib/quote-cache-service";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Live prices — reads shared quote cache; no Finnhub per user in scale mode. */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    const max = Math.min(
      12,
      Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 12) || 12)
    );
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && isValidTickerFormat(s))
      .slice(0, max);

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    let quotes = await getCachedQuotes(symbols);
    const missing = symbols.filter((s) => !quotes[s]);

    if (missing.length > 0 && !isScaleMode()) {
      await refreshQuoteCache(missing);
      quotes = { ...(await getCachedQuotes(symbols)), ...quotes };
    }

    if (Object.keys(quotes).length === 0 && !isScaleMode()) {
      const key = resolveFinnhubKey();
      if (key) {
        for (const symbol of symbols) {
          try {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
              { cache: "no-store" }
            );
            if (!res.ok) continue;
            const quote = await res.json();
            if (!quote?.c || quote.c <= 0) continue;
            quotes[symbol] = {
              price: quote.c,
              changePercent: quote.dp ?? 0,
              change: quote.d ?? 0,
            };
          } catch {
            /* skip */
          }
        }
      }
    }

    return NextResponse.json({
      quotes,
      updatedAt: new Date().toISOString(),
      cached: isScaleMode(),
    });
  } catch (error) {
    console.error("Quotes API error:", error);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}
