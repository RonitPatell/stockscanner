import type { CatalystItem, StockQuote } from "@/types";
import { fetchQuoteTrusted, fetchVolumeForSymbol } from "./market-data";
import { computeRvol } from "./volume-utils";

/** Refresh live prices and volume before ranking movers */
export async function refreshCatalystQuotes(
  catalysts: CatalystItem[],
  maxSymbols = 40
): Promise<CatalystItem[]> {
  const symbols = [...new Set(catalysts.map((c) => c.symbol))].slice(0, maxSymbols);
  const quotes = new Map<string, StockQuote>();
  const volumes = new Map<string, { volume: number; avgVolume: number }>();

  await Promise.all(
    symbols.map(async (symbol) => {
      const [q, vol] = await Promise.all([
        fetchQuoteTrusted(symbol),
        fetchVolumeForSymbol(symbol),
      ]);
      if (q) quotes.set(symbol, q);
      if (vol) volumes.set(symbol, vol);
    })
  );

  return catalysts.map((c) => {
    const q = quotes.get(c.symbol);
    const vol = volumes.get(c.symbol);
    const volume = vol?.volume ?? c.volume;
    const avgVolume = vol?.avgVolume ?? c.avgVolume;
    if (!q && !vol) return { ...c, rVol: computeRvol(c.volume, c.avgVolume) ?? c.rVol };
    return {
      ...c,
      price: q?.price ?? c.price,
      changePercent: q?.changePercent ?? c.changePercent,
      marketCap: q?.marketCap ?? c.marketCap,
      floatShares: q?.floatShares ?? c.floatShares,
      volume,
      avgVolume,
      rVol: computeRvol(volume, avgVolume) ?? c.rVol,
    };
  });
}
