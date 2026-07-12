import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isQuotableMarketSymbol } from "@/lib/index-quotes";
import { resolveFinnhubKey } from "@/lib/finnhub-key";
import {
  getCachedQuotes,
  refreshQuoteCache,
  refreshQuoteVolumes,
  isLiveQuoteStreamFresh,
  type CachedQuote,
} from "@/lib/quote-cache-service";
import { getCachedProfiles, refreshProfileCache } from "@/lib/profile-cache-service";
import { estimateRvolFromMove } from "@/lib/volume-utils";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const PRICE_BUDGET_MS = 5_000;
const RVOL_BUDGET_MS = 8_000;
const PROFILE_BUDGET_MS = 6_000;

async function withBudget<T>(fn: () => Promise<T>, fallback: T, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

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

/** Live prices — cache-first; refreshes price, RVOL, float/mcap on demand. */
export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

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
      .filter((s) => s.length > 0 && (isValidTickerFormat(s) || isQuotableMarketSymbol(s)))
      .slice(0, max);

    if (symbols.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    const liveOnly =
      req.nextUrl.searchParams.get("live") === "1" || (await isLiveQuoteStreamFresh());

    let quotes: Record<string, CachedQuote> = await getCachedQuotes(symbols);

    const missingPrice = symbols.filter((s) => !quotes[s]?.price);
    if (missingPrice.length > 0 && !liveOnly) {
      await withBudget(
        () => refreshQuoteCache(missingPrice, { fetchVolume: false }),
        0,
        PRICE_BUDGET_MS
      );
      quotes = { ...quotes, ...(await getCachedQuotes(missingPrice)) };
    }

    if (needRvol) {
      quotes = applyInstantRvolEstimates(quotes, symbols);

      const missingRvol = symbols.filter((s) => quotes[s]?.price && quotes[s]?.rVol == null);
      if (missingRvol.length > 0 && !liveOnly) {
        await withBudget(() => refreshQuoteVolumes(missingRvol), 0, RVOL_BUDGET_MS);
        quotes = {
          ...quotes,
          ...applyInstantRvolEstimates(await getCachedQuotes(symbols), symbols),
        };
      }
    }

    if (needProfile) {
      let profiles = await getCachedProfiles(symbols);
      const missingProfiles = symbols.filter((s) => !profiles[s]);
      if (missingProfiles.length > 0) {
        await withBudget(() => refreshProfileCache(missingProfiles), 0, PROFILE_BUDGET_MS);
        profiles = { ...(await getCachedProfiles(symbols)) };
      }

      for (const sym of symbols) {
        const p = profiles[sym];
        const q = quotes[sym];
        if (!p || !q) continue;
        quotes[sym] = {
          ...q,
          floatShares: p.floatShares,
          marketCap: p.marketCap,
        };
      }
    }

    if (Object.keys(quotes).length === 0 && !isScaleMode()) {
      const key = resolveFinnhubKey();
      if (key) {
        for (const symbol of symbols.slice(0, 8)) {
          try {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
              { cache: "no-store", signal: AbortSignal.timeout(3_000) }
            );
            if (!res.ok) continue;
            const quote = await res.json();
            if (!quote?.c || quote.c <= 0) continue;
            quotes[symbol] = {
              price: quote.c,
              changePercent: quote.dp ?? 0,
              change: quote.d ?? 0,
              rVol: estimateRvolFromMove(quote.dp ?? 0) ?? undefined,
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
      live: liveOnly,
    });
  } catch (error) {
    console.error("Quotes API error:", error);
    return NextResponse.json({ quotes: {}, error: "Failed to fetch quotes" }, { status: 200 });
  }
}
