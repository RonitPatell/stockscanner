import type { CatalystItem, StockQuote } from "@/types";
import { fetchQuoteLive } from "./market-data";
import { computeRvol } from "./volume-utils";
import { prisma } from "./prisma";

let quoteRefreshInFlight = false;

/**
 * Refresh live prices for feed symbols (price-only — volume is too expensive).
 * Skip if a refresh is already running so we don't pile up Finnhub calls.
 */
export async function refreshCatalystQuotes(
  catalysts: CatalystItem[],
  maxSymbols = 8
): Promise<CatalystItem[]> {
  if (quoteRefreshInFlight) return catalysts;
  quoteRefreshInFlight = true;

  try {
    const symbols = [...new Set(catalysts.map((c) => c.symbol))].slice(0, maxSymbols);
    const quotes = new Map<string, StockQuote>();

    for (const symbol of symbols) {
      const q = await fetchQuoteLive(symbol);
      if (q) quotes.set(symbol, q);
    }

    if (quotes.size > 0) {
      void Promise.all(
        [...quotes.entries()].map(([symbol, q]) =>
          prisma.catalyst
            .updateMany({
              where: { symbol },
              data: {
                price: q.price,
                changePercent: q.changePercent,
              },
            })
            .catch(() => {})
        )
      ).catch(() => {});
    }

    return catalysts.map((c) => {
      const q = quotes.get(c.symbol);
      if (!q) return c;
      return {
        ...c,
        price: q.price,
        changePercent: q.changePercent,
        rVol: computeRvol(c.volume, c.avgVolume) ?? c.rVol,
      };
    });
  } finally {
    quoteRefreshInFlight = false;
  }
}
