import { finnhubFetch } from "./finnhub-queue";
import { resolveFinnhubKey } from "./finnhub-key";
import { isValidTickerFormat } from "./ticker-utils";
import { getRedis } from "./redis";

export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  hour?: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const EARNINGS_REDIS_KEY = "earnings:v1";
const POSITIVE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_MS = 2 * 60 * 60 * 1000;

const memoryCache = new Map<string, { ts: number; event: EarningsEvent | null }>();

function toYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isUpcoming(date: string): boolean {
  const today = toYmd(new Date());
  return date >= today;
}

async function readCached(sym: string): Promise<EarningsEvent | null | undefined> {
  const mem = memoryCache.get(sym);
  if (mem) {
    if (mem.event && isUpcoming(mem.event.date)) {
      if (Date.now() - mem.ts < POSITIVE_CACHE_MS) return mem.event;
    } else if (!mem.event) {
      if (Date.now() - mem.ts < NEGATIVE_CACHE_MS) return null;
    }
  }

  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, EarningsEvent>>(EARNINGS_REDIS_KEY);
      const hit = all?.[sym];
      if (hit && isUpcoming(hit.date)) {
        memoryCache.set(sym, { ts: Date.now(), event: hit });
        return hit;
      }
    } catch {
      /* ignore */
    }
  }

  return undefined;
}

async function writeCached(sym: string, event: EarningsEvent | null): Promise<void> {
  memoryCache.set(sym, { ts: Date.now(), event });

  if (!event) return;

  const redis = getRedis();
  if (redis) {
    try {
      const merged = {
        ...(await redis.get<Record<string, EarningsEvent>>(EARNINGS_REDIS_KEY)),
        [sym]: event,
      };
      await redis.set(EARNINGS_REDIS_KEY, merged, { ex: 604_800 });
    } catch {
      /* memory ok */
    }
  }
}

export async function fetchNextEarningsForSymbol(
  symbol: string,
  daysForward = 45
): Promise<EarningsEvent | null> {
  const sym = symbol.toUpperCase();
  if (!isValidTickerFormat(sym)) return null;

  const cached = await readCached(sym);
  if (cached !== undefined) return cached;

  const key = resolveFinnhubKey();
  if (!key) return null;

  const from = new Date();
  const to = new Date(Date.now() + daysForward * 24 * 60 * 60 * 1000);

  try {
    const url =
      `${FINNHUB_BASE}/calendar/earnings?` +
      `from=${encodeURIComponent(toYmd(from))}` +
      `&to=${encodeURIComponent(toYmd(to))}` +
      `&symbol=${encodeURIComponent(sym)}` +
      `&international=false` +
      `&token=${encodeURIComponent(key)}`;

    const res = await finnhubFetch(url);
    if (!res.ok) {
      memoryCache.set(sym, { ts: Date.now(), event: null });
      return null;
    }

    const data = (await res.json()) as { earningsCalendar?: unknown[] } | null;
    const list = Array.isArray(data?.earningsCalendar) ? data!.earningsCalendar : [];
    if (list.length === 0) {
      memoryCache.set(sym, { ts: Date.now(), event: null });
      return null;
    }

    const e = list[0] as Record<string, unknown>;
    const event: EarningsEvent | null =
      e && typeof e.date === "string" && isUpcoming(e.date)
        ? {
            symbol: sym,
            date: e.date,
            hour: typeof e.hour === "string" ? e.hour : undefined,
            epsEstimate: typeof e.epsEstimate === "number" ? e.epsEstimate : null,
            epsActual: typeof e.epsActual === "number" ? e.epsActual : null,
            revenueEstimate: typeof e.revenueEstimate === "number" ? e.revenueEstimate : null,
            revenueActual: typeof e.revenueActual === "number" ? e.revenueActual : null,
          }
        : null;

    await writeCached(sym, event);
    return event;
  } catch {
    memoryCache.set(sym, { ts: Date.now(), event: null });
    return null;
  }
}

export async function fetchUpcomingEarningsBatch(
  symbols: string[],
  maxSymbols = 10
): Promise<EarningsEvent[]> {
  const unique = [
    ...new Set(symbols.map((s) => s.toUpperCase()).filter(isValidTickerFormat)),
  ].slice(0, maxSymbols);

  const out: EarningsEvent[] = [];
  for (const sym of unique) {
    const e = await fetchNextEarningsForSymbol(sym);
    if (e) out.push(e);
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** All known upcoming earnings from server cache (for sticky dashboard panel). */
export async function getKnownUpcomingEarnings(): Promise<EarningsEvent[]> {
  const out: EarningsEvent[] = [];
  const seen = new Set<string>();

  for (const { event } of memoryCache.values()) {
    if (!event || !isUpcoming(event.date)) continue;
    if (seen.has(event.symbol)) continue;
    seen.add(event.symbol);
    out.push(event);
  }

  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, EarningsEvent>>(EARNINGS_REDIS_KEY);
      if (all) {
        for (const event of Object.values(all)) {
          if (!event || !isUpcoming(event.date)) continue;
          if (seen.has(event.symbol)) continue;
          seen.add(event.symbol);
          out.push(event);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}
