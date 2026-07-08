import { fetchQuoteLive } from "./market-data";
import { isValidTickerFormat } from "./ticker-utils";
import { getRedis } from "./redis";

export interface CachedQuote {
  price: number;
  changePercent: number;
  change: number;
}

const QUOTES_KEY = "quotes:v1";
const QUOTES_TTL_SEC = 30;

type MemoryQuotes = { ts: number; quotes: Record<string, CachedQuote> };

const globalStore = globalThis as typeof globalThis & {
  __trustQuoteCache?: MemoryQuotes;
};

function memoryQuotes(): MemoryQuotes {
  if (!globalStore.__trustQuoteCache) {
    globalStore.__trustQuoteCache = { ts: 0, quotes: {} };
  }
  return globalStore.__trustQuoteCache;
}

export async function getCachedQuotes(
  symbols: string[]
): Promise<Record<string, CachedQuote>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
    isValidTickerFormat
  );
  if (wanted.length === 0) return {};

  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, CachedQuote>>(QUOTES_KEY);
      if (all && typeof all === "object") {
        const out: Record<string, CachedQuote> = {};
        for (const sym of wanted) {
          if (all[sym]) out[sym] = all[sym];
        }
        if (Object.keys(out).length > 0) return out;
      }
    } catch {
      /* fall through */
    }
  }

  const mem = memoryQuotes();
  if (Date.now() - mem.ts < 15_000) {
    const out: Record<string, CachedQuote> = {};
    for (const sym of wanted) {
      if (mem.quotes[sym]) out[sym] = mem.quotes[sym];
    }
    return out;
  }
  return {};
}

export async function refreshQuoteCache(symbols: string[]): Promise<number> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))]
    .filter(isValidTickerFormat)
    .slice(0, 40);

  if (unique.length === 0) return 0;

  const existing = await getCachedQuotes(unique);
  const quotes: Record<string, CachedQuote> = { ...existing };
  let updated = 0;

  for (const symbol of unique) {
    try {
      const q = await fetchQuoteLive(symbol);
      if (!q) continue;
      quotes[symbol] = {
        price: q.price,
        changePercent: q.changePercent,
        change: q.change,
      };
      updated++;
    } catch {
      /* skip */
    }
  }

  memoryQuotes().quotes = quotes;
  memoryQuotes().ts = Date.now();

  const redis = getRedis();
  if (redis && Object.keys(quotes).length > 0) {
    try {
      await redis.set(QUOTES_KEY, quotes, { ex: QUOTES_TTL_SEC });
    } catch {
      /* memory ok */
    }
  }

  return updated;
}

export function mergeQuotesIntoFeed<T extends { symbol: string; price?: number | null; changePercent?: number | null }>(
  items: T[],
  quotes: Record<string, CachedQuote>
): T[] {
  if (!Object.keys(quotes).length) return items;
  return items.map((c) => {
    const q = quotes[c.symbol];
    if (!q) return c;
    return { ...c, price: q.price, changePercent: q.changePercent };
  });
}
