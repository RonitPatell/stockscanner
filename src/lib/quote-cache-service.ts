import { fetchQuoteLive, fetchVolumeForSymbol } from "./market-data";
import { isValidTickerFormat } from "./ticker-utils";
import { fetchVixQuote, isQuotableMarketSymbol } from "./index-quotes";
import { getRedis } from "./redis";
import { computeRvol, estimateRvolFromMove } from "./volume-utils";

export interface CachedQuote {
  price: number;
  changePercent: number;
  change: number;
  volume?: number;
  avgVolume?: number;
  rVol?: number | null;
  floatShares?: number;
  marketCap?: number;
}

const QUOTES_KEY = "quotes:v2";
export const LIVE_STREAM_TS_KEY = "quotes:live:ts";
/** @deprecated Use LIVE_STREAM_TS_KEY */
export const ALPACA_LIVE_TS_KEY = LIVE_STREAM_TS_KEY;
const QUOTES_TTL_SEC = 30;
const LIVE_STREAM_FRESH_MS = 12_000;
const VOLUME_FETCH_PER_REFRESH = 20;
const QUOTE_CONCURRENCY = 6;
const VOLUME_CONCURRENCY = 2;

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

async function persistQuotes(quotes: Record<string, CachedQuote>): Promise<void> {
  memoryQuotes().quotes = { ...memoryQuotes().quotes, ...quotes };
  memoryQuotes().ts = Date.now();

  const redis = getRedis();
  if (redis && Object.keys(quotes).length > 0) {
    try {
      const merged = { ...(await redis.get<Record<string, CachedQuote>>(QUOTES_KEY)), ...quotes };
      await redis.set(QUOTES_KEY, merged, { ex: QUOTES_TTL_SEC });
    } catch {
      /* memory ok */
    }
  }
}

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

export async function getCachedQuotes(
  symbols: string[]
): Promise<Record<string, CachedQuote>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
    (s) => isValidTickerFormat(s) || isQuotableMarketSymbol(s)
  );
  if (wanted.length === 0) return {};

  const out: Record<string, CachedQuote> = {};

  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, CachedQuote>>(QUOTES_KEY);
      if (all && typeof all === "object") {
        for (const sym of wanted) {
          if (all[sym]) out[sym] = all[sym];
        }
      }
    } catch {
      /* fall through */
    }
  }

  const mem = memoryQuotes();
  for (const sym of wanted) {
    if (!out[sym] && mem.quotes[sym]) out[sym] = mem.quotes[sym];
  }

  return out;
}

export async function touchLiveQuoteStreamTimestamp(): Promise<void> {
  const ts = Date.now();
  memoryQuotes().ts = ts;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(LIVE_STREAM_TS_KEY, ts, { ex: 60 });
    } catch {
      /* memory ok */
    }
  }
}

/** @deprecated Use touchLiveQuoteStreamTimestamp */
export const touchAlpacaLiveTimestamp = touchLiveQuoteStreamTimestamp;

export async function isLiveQuoteStreamFresh(): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const ts = await redis.get<number>(LIVE_STREAM_TS_KEY);
      if (typeof ts === "number" && Date.now() - ts < LIVE_STREAM_FRESH_MS) return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

/** @deprecated Use isLiveQuoteStreamFresh */
export const isAlpacaStreamFresh = isLiveQuoteStreamFresh;

/** Update price from a live tick while preserving daily % move. */
export function repriceFromTick(
  existing: CachedQuote | undefined,
  price: number
): CachedQuote {
  if (
    existing?.price &&
    existing.changePercent != null &&
    Number.isFinite(existing.changePercent) &&
    Math.abs(existing.changePercent) < 500
  ) {
    const prevClose = existing.price / (1 + existing.changePercent / 100);
    if (prevClose > 0) {
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;
      return {
        ...existing,
        price,
        change,
        changePercent,
      };
    }
  }
  return {
    price,
    changePercent: existing?.changePercent ?? 0,
    change: existing?.change ?? 0,
    volume: existing?.volume,
    avgVolume: existing?.avgVolume,
    rVol: existing?.rVol,
    floatShares: existing?.floatShares,
    marketCap: existing?.marketCap,
  };
}

export async function applyTickQuote(symbol: string, price: number): Promise<void> {
  const sym = symbol.toUpperCase();
  const existing = (await getCachedQuotes([sym]))[sym];
  const next = repriceFromTick(existing, price);
  await persistQuotes({ [sym]: next });
  await touchLiveQuoteStreamTimestamp();
}

async function refreshOneQuote(
  symbol: string,
  existing: Record<string, CachedQuote>,
  fetchVolume: boolean,
  volumeBudget: { left: number }
): Promise<CachedQuote | null> {
  try {
    if (symbol === "VIX") {
      const vix = await fetchVixQuote();
      if (!vix) return existing[symbol] ?? null;
      return vix;
    }

    const q = await fetchQuoteLive(symbol);
    if (!q) return existing[symbol] ?? null;

    let volume = existing[symbol]?.volume;
    let avgVolume = existing[symbol]?.avgVolume;
    let rVol = existing[symbol]?.rVol;

    const needsVolume =
      fetchVolume && rVol == null && volumeBudget.left > 0;
    if (needsVolume) {
      volumeBudget.left--;
      const vol = await fetchVolumeForSymbol(symbol);
      if (vol) {
        volume = vol.volume;
        avgVolume = vol.avgVolume;
        rVol = computeRvol(volume, avgVolume);
      }
    } else if (volume != null && avgVolume != null) {
      rVol = computeRvol(volume, avgVolume);
    }

    if (rVol == null) {
      rVol = estimateRvolFromMove(q.changePercent);
    }

    return {
      price: q.price,
      changePercent: q.changePercent,
      change: q.change,
      volume,
      avgVolume,
      rVol,
    };
  } catch {
    return existing[symbol] ?? null;
  }
}

/** Refresh live prices (and optionally volume / RVOL) for symbols. */
export async function refreshQuoteCache(
  symbols: string[],
  options: { fetchVolume?: boolean } = {}
): Promise<number> {
  const fetchVolume = options.fetchVolume !== false;
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))]
    .filter((s) => isValidTickerFormat(s) || isQuotableMarketSymbol(s))
    .slice(0, 64);

  if (unique.length === 0) return 0;

  const existing = await getCachedQuotes(unique);
  const quotes: Record<string, CachedQuote> = { ...existing };
  let updated = 0;
  const volumeBudget = { left: VOLUME_FETCH_PER_REFRESH };

  await runPool(unique, QUOTE_CONCURRENCY, async (symbol) => {
    const next = await refreshOneQuote(symbol, quotes, fetchVolume, volumeBudget);
    if (!next) return;
    quotes[symbol] = next;
    updated++;
  });

  await persistQuotes(quotes);
  return updated;
}

/** Backfill RVOL for symbols that already have a cached price. */
export async function refreshQuoteVolumes(symbols: string[]): Promise<number> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))]
    .filter((s) => isValidTickerFormat(s) || isQuotableMarketSymbol(s))
    .slice(0, 32);

  if (unique.length === 0) return 0;

  const existing = await getCachedQuotes(unique);
  const needsRvol = unique.filter((s) => existing[s]?.price && existing[s]?.rVol == null);
  if (needsRvol.length === 0) return 0;

  const quotes: Record<string, CachedQuote> = { ...existing };
  let updated = 0;

  await runPool(needsRvol.slice(0, VOLUME_FETCH_PER_REFRESH), VOLUME_CONCURRENCY, async (symbol) => {
    const hit = quotes[symbol];
    if (!hit?.price) return;

    const vol = await fetchVolumeForSymbol(symbol);
    if (vol) {
      quotes[symbol] = {
        ...hit,
        volume: vol.volume,
        avgVolume: vol.avgVolume,
        rVol: computeRvol(vol.volume, vol.avgVolume),
      };
      updated++;
      return;
    }

    const est = estimateRvolFromMove(hit.changePercent);
    if (est != null) {
      quotes[symbol] = { ...hit, rVol: est };
      updated++;
    }
  });

  await persistQuotes(quotes);
  return updated;
}

/** Merge scanner / ingest volume into the shared quote cache. */
export async function seedCachedQuote(
  symbol: string,
  patch: Partial<CachedQuote> & Pick<CachedQuote, "price" | "changePercent" | "change">
): Promise<void> {
  const sym = symbol.toUpperCase();
  const existing = (await getCachedQuotes([sym]))[sym];
  const merged: CachedQuote = {
    price: patch.price,
    changePercent: patch.changePercent,
    change: patch.change,
    volume: patch.volume ?? existing?.volume,
    avgVolume: patch.avgVolume ?? existing?.avgVolume,
    rVol:
      patch.rVol != null
        ? patch.rVol
        : existing?.rVol ??
          computeRvol(patch.volume ?? existing?.volume, patch.avgVolume ?? existing?.avgVolume) ??
          estimateRvolFromMove(patch.changePercent),
  };
  await persistQuotes({ [sym]: merged });
}

export function mergeQuotesIntoFeed<
  T extends {
    symbol: string;
    price?: number | null;
    changePercent?: number | null;
    rVol?: number | null;
    volume?: number | null;
    avgVolume?: number | null;
  },
>(items: T[], quotes: Record<string, CachedQuote>): T[] {
  if (!Object.keys(quotes).length) return items;
  return items.map((c) => {
    const q = quotes[c.symbol.toUpperCase()] ?? quotes[c.symbol];
    if (!q) return c;
    return {
      ...c,
      price: q.price,
      changePercent: q.changePercent,
      rVol: q.rVol != null ? q.rVol : c.rVol,
      volume: q.volume ?? c.volume,
      avgVolume: q.avgVolume ?? c.avgVolume,
    };
  });
}
