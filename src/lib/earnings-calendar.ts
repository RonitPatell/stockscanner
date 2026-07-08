import { finnhubFetch } from "./finnhub-queue";
import { resolveFinnhubKey } from "./finnhub-key";
import { isValidTickerFormat } from "./ticker-utils";

export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  hour?: string; // bmo | amc | dmh | unknown (Finnhub varies)
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}

const FINNHUB_BASE = "https://finnhub.io/api/v1";

const cache = new Map<string, { ts: number; event: EarningsEvent | null }>();
const CACHE_MS = 6 * 60 * 60 * 1000;

function toYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchNextEarningsForSymbol(
  symbol: string,
  daysForward = 30
): Promise<EarningsEvent | null> {
  const sym = symbol.toUpperCase();
  if (!isValidTickerFormat(sym)) return null;

  const cached = cache.get(sym);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.event;

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
      cache.set(sym, { ts: Date.now(), event: null });
      return null;
    }

    const data = (await res.json()) as { earningsCalendar?: any[] } | null;
    const list = Array.isArray(data?.earningsCalendar) ? data!.earningsCalendar : [];
    if (list.length === 0) {
      cache.set(sym, { ts: Date.now(), event: null });
      return null;
    }

    // Finnhub returns entries sorted by date; take the first upcoming
    const e = list[0] ?? null;
    const event: EarningsEvent | null =
      e && typeof e.date === "string"
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

    cache.set(sym, { ts: Date.now(), event });
    return event;
  } catch {
    cache.set(sym, { ts: Date.now(), event: null });
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

