"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface LiveQuote {
  price: number;
  changePercent: number;
  change: number;
  rVol?: number | null;
  volume?: number;
  avgVolume?: number;
  floatShares?: number;
  marketCap?: number;
}

interface LiveQuoteContextValue {
  quotes: Record<string, LiveQuote>;
  register: (id: string, symbols: string[]) => void;
  unregister: (id: string) => void;
}

const LiveQuoteContext = createContext<LiveQuoteContextValue | null>(null);

const PROFILE_POLL_MS = 8_000;
const SSE_FALLBACK_POLL_MS = 2_000;
const BATCH_SIZE = 32;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchQuoteBatch(
  symbols: string[],
  live = false
): Promise<Record<string, LiveQuote>> {
  if (symbols.length === 0) return {};
  try {
    const liveParam = live ? "&live=1" : "";
    const res = await fetch(
      `/api/quotes?symbols=${symbols.join(",")}&max=${BATCH_SIZE}&needRvol=1&needProfile=1${liveParam}`
    );
    if (!res.ok) return {};
    const data = await res.json();
    return (data.quotes ?? {}) as Record<string, LiveQuote>;
  } catch {
    return {};
  }
}

export function LiveQuoteProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [symbolKey, setSymbolKey] = useState("");
  const [streamLive, setStreamLive] = useState(false);
  const registriesRef = useRef<Map<string, string[]>>(new Map());
  const pollInFlightRef = useRef(false);

  const register = useCallback((id: string, symbols: string[]) => {
    registriesRef.current.set(
      id,
      [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))]
    );
  }, []);

  const unregister = useCallback((id: string) => {
    registriesRef.current.delete(id);
  }, []);

  const collectSymbols = useCallback((): string[] => {
    const all = new Set<string>();
    for (const syms of registriesRef.current.values()) {
      for (const s of syms) all.add(s);
    }
    return [...all].sort();
  }, []);

  const pollAll = useCallback(async () => {
    if (pollInFlightRef.current) return;
    const list = collectSymbols();
    if (list.length === 0) return;

    pollInFlightRef.current = true;
    try {
      const batches = chunk(list, BATCH_SIZE);
      const results = await Promise.all(batches.map((batch) => fetchQuoteBatch(batch, false)));
      const merged: Record<string, LiveQuote> = {};
      for (const chunkQuotes of results) {
        Object.assign(merged, chunkQuotes);
      }
      if (Object.keys(merged).length === 0) return;
      setQuotes((prev) => ({ ...prev, ...merged }));
    } finally {
      pollInFlightRef.current = false;
    }
  }, [collectSymbols]);

  useEffect(() => {
    const syncRegistry = () => {
      const key = collectSymbols().join(",");
      setSymbolKey((prev) => (prev === key ? prev : key));
    };
    syncRegistry();
    const watch = setInterval(syncRegistry, 750);
    return () => clearInterval(watch);
  }, [collectSymbols]);

  useEffect(() => {
    if (!symbolKey) {
      setStreamLive(false);
      return;
    }

    const es = new EventSource(
      `/api/quotes/stream?symbols=${encodeURIComponent(symbolKey)}`
    );

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string;
          quotes?: Record<string, LiveQuote>;
          live?: boolean;
        };
        if (data.type === "quotes" && data.quotes) {
          setStreamLive(data.live === true);
          setQuotes((prev) => ({ ...prev, ...data.quotes }));
        }
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      setStreamLive(false);
    };

    return () => es.close();
  }, [symbolKey]);

  useEffect(() => {
    if (!symbolKey) return;
    void pollAll();
    const interval = setInterval(
      () => void pollAll(),
      streamLive ? PROFILE_POLL_MS : SSE_FALLBACK_POLL_MS
    );
    return () => clearInterval(interval);
  }, [streamLive, pollAll, symbolKey]);

  const value = useMemo(
    () => ({ quotes, register, unregister }),
    [quotes, register, unregister]
  );

  return (
    <LiveQuoteContext.Provider value={value}>{children}</LiveQuoteContext.Provider>
  );
}

export function useLiveQuoteContext(): LiveQuoteContextValue {
  const ctx = useContext(LiveQuoteContext);
  if (!ctx) {
    throw new Error("useLiveQuoteContext must be used within LiveQuoteProvider");
  }
  return ctx;
}

/** Register symbols for live quote polling (auto-cleanup on unmount). */
export function useRegisterLiveSymbols(id: string, symbols: string[]) {
  const { register, unregister } = useLiveQuoteContext();
  const key = useMemo(
    () => [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].sort().join(","),
    [symbols]
  );

  useEffect(() => {
    register(id, key ? key.split(",") : []);
    return () => unregister(id);
  }, [id, key, register, unregister]);
}

export function useLiveQuotes(): Record<string, LiveQuote> {
  return useLiveQuoteContext().quotes;
}

/** Safe outside LiveQuoteProvider (e.g. demo page). */
export function useLiveQuotesOptional(): Record<string, LiveQuote> {
  return useContext(LiveQuoteContext)?.quotes ?? {};
}

export function useLiveQuote(symbol: string): LiveQuote | null {
  const quotes = useLiveQuotes();
  return quotes[symbol.toUpperCase()] ?? null;
}

/** Single source of truth for price / % change shown in the UI. */
export function pickLiveField<T>(
  symbol: string,
  quotes: Record<string, LiveQuote>,
  field: keyof LiveQuote,
  fallback?: T | null
): T | null {
  const q = quotes[symbol.toUpperCase()];
  if (q && q[field] != null) return q[field] as T;
  return fallback ?? null;
}

export function applyLiveQuote<T extends {
  symbol: string;
  price?: number | null;
  changePercent?: number | null;
  rVol?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  floatShares?: number | null;
  marketCap?: number | null;
}>(item: T, quotes: Record<string, LiveQuote>): T {
  const q = quotes[item.symbol.toUpperCase()];
  if (!q) return item;
  return {
    ...item,
    price: q.price,
    changePercent: q.changePercent,
    rVol: q.rVol != null ? q.rVol : item.rVol,
    volume: q.volume ?? item.volume,
    avgVolume: q.avgVolume ?? item.avgVolume,
    floatShares: q.floatShares ?? item.floatShares,
    marketCap: q.marketCap ?? item.marketCap,
  };
}
