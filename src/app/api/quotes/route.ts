import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isQuotableMarketSymbol } from "@/lib/index-quotes";
import {
  getCachedQuotes,
  isLiveQuoteStreamFresh,
  type CachedQuote,
} from "@/lib/quote-cache-service";
import { getCachedProfiles } from "@/lib/profile-cache-service";
import { estimateRvolFromMove } from "@/lib/volume-utils";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

function applyInstantRvolEstimates(
  quotes: Record<string, CachedQuote>,
  symbols: string[]
): Record<string, CachedQuote> {
  const out = { ...quotes };
  for (const sym of symbols) {
    const q = out[sym];
    if (!q?.price || q.rVol != null) continue;
    const est = estimateRvolFromMove(q.changePercent);
    if (est != null) out[sym] = { ...q, rVol: est };
  }
  return out;
}

/**
 * Live prices — worker-warmed cache / stream only.
 * Never opens Finnhub/Yahoo from user traffic.
 */
export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`quotes:${gate.user.id}:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many quote requests" },
      { status: 429, headers: rateLimitHeaders(rl, 120) }
    );
  }

  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    const needRvol = req.nextUrl.searchParams.get("needRvol") === "1";
    const needProfile = req.nextUrl.searchParams.get("needProfile") === "1";
    const max = Math.min(
      64,
      Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 32) || 32)
    );
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(
        (s) =>
          s.length > 0 &&
          (isValidTickerFormat(s) || isQuotableMarketSymbol(s))
      )
      .slice(0, max);

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    const live = await isLiveQuoteStreamFresh();
    let quotes: Record<string, CachedQuote> = await getCachedQuotes(symbols);

    if (needRvol) {
      quotes = applyInstantRvolEstimates(quotes, symbols);
    }

    if (needProfile) {
      const profiles = await getCachedProfiles(symbols);
      for (const sym of symbols) {
        const p = profiles[sym];
        if (!p) continue;
        const q = quotes[sym];
        const float =
          (q?.floatShares != null && q.floatShares > 0
            ? q.floatShares
            : null) ?? (p.floatShares > 0 ? p.floatShares : undefined);
        const mcap =
          (q?.marketCap != null && q.marketCap > 0 ? q.marketCap : null) ??
          (p.marketCap > 0 ? p.marketCap : undefined);
        if (q) {
          quotes[sym] = {
            ...q,
            floatShares: float ?? q.floatShares,
            marketCap: mcap ?? q.marketCap,
          };
        } else if (float != null || mcap != null) {
          quotes[sym] = {
            price: 0,
            changePercent: 0,
            change: 0,
            floatShares: float,
            marketCap: mcap,
          };
        }
      }
    }

    return NextResponse.json({
      quotes,
      updatedAt: new Date().toISOString(),
      cached: true,
      live,
      workerOwned: true,
      scaleMode: isScaleMode(),
    });
  } catch (error) {
    console.error("Quotes API error:", error);
    return NextResponse.json(
      { quotes: {}, error: "Failed to read quotes", workerOwned: true },
      { status: 200 }
    );
  }
}
