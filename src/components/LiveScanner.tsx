"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Radio,
  Filter,
  RefreshCw,
  Search,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Star,
  Download,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CatalystCard } from "./CatalystCard";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { CatalystItem, ScannerFilters } from "@/types";
import { CATALYST_TYPES } from "@/types";
import { cn, formatClockTime } from "@/lib/utils";
import {
  applyLiveQuote,
  useLiveQuotes,
  useRegisterLiveSymbols,
} from "./LiveQuoteProvider";

export type ScannerTab = "all" | "premarket" | "watchlist";

const POLL_MS = 12_000;
const MAX_FEED_AGE_MS = 24 * 60 * 60 * 1000;
const ROW_ESTIMATE_PX = 72;

async function safeJsonFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function LiveScanner({
  embedded = false,
  tab = "all",
  onTabChange,
  initialCatalysts = [],
  initialWatchlist = [],
  initialFilters = null,
}: {
  embedded?: boolean;
  tab?: ScannerTab;
  onTabChange?: (tab: ScannerTab) => void;
  initialCatalysts?: CatalystItem[];
  initialWatchlist?: string[];
  initialFilters?: ScannerFilters | null;
}) {
  const [catalysts, setCatalysts] = useState<CatalystItem[]>(initialCatalysts);
  const [loading, setLoading] = useState(initialCatalysts.length === 0);
  const [connected, setConnected] = useState(initialCatalysts.length > 0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(
    initialCatalysts.length > 0 ? new Date() : null
  );
  const [newSymbols, setNewSymbols] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ScannerFilters>(initialFilters ?? {});
  const [showFilters, setShowFilters] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [moversOnly, setMoversOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>(initialWatchlist);
  const [focusIndex, setFocusIndex] = useState(0);
  const [hotkeyExpanded, setHotkeyExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevSymbolsRef = useRef<Set<string>>(
    new Set(initialCatalysts.map((c) => c.symbol))
  );
  const catalystsRef = useRef<CatalystItem[]>(initialCatalysts);
  const catalystFetchInFlightRef = useRef(false);
  const catalystGenRef = useRef(0);
  const hotkeyRef = useRef({
    filtered: [] as CatalystItem[],
    focusIndex: 0,
    onTabChange: undefined as typeof onTabChange,
    toggleWatchlist: async (_symbol: string) => {},
  });
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const liveQuotes = useLiveQuotes();

  useRegisterLiveSymbols(
    "live-scanner",
    catalysts.map((c) => c.symbol)
  );

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    catalystsRef.current = catalysts;
  }, [catalysts]);

  useEffect(() => {
    if (Object.keys(liveQuotes).length === 0) return;
    setCatalysts((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        const updated = applyLiveQuote(c, liveQuotes);
        if (updated !== c) changed = true;
        return updated;
      });
      return changed ? next : prev;
    });
  }, [liveQuotes]);

  const loadWatchlist = useCallback(async () => {
    if (initialWatchlist.length > 0) return;
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setWatchlist((data.watchlist ?? []).map((s: string) => s.toUpperCase()));
      if (data.scannerFilters && typeof data.scannerFilters === "object") {
        setFilters(data.scannerFilters as ScannerFilters);
      }
    } catch { /* ignore */ }
  }, [initialWatchlist.length]);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Persist filters as the user tweaks them (debounced) — skip identical SSR seed
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtersHydratedRef = useRef(false);
  useEffect(() => {
    if (!filtersHydratedRef.current) {
      filtersHydratedRef.current = true;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scannerFilters: filters }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [filters]);

  const applyFeedUpdate = useCallback(
    (items: CatalystItem[]) => {
      if (items.length === 0 && catalystsRef.current.length > 0) return;
      const fresh = items.filter(
        (c) => Date.now() - new Date(c.publishedAt).getTime() <= MAX_FEED_AGE_MS
      );
      if (fresh.length === 0 && catalystsRef.current.length > 0) return;
      setCatalysts(fresh.map((c) => applyLiveQuote(c, liveQuotes)));
      setLastUpdate(new Date());
      setConnected(true);
      setLoading(false);
    },
    [liveQuotes]
  );

  const fetchCatalysts = useCallback(async () => {
    if (catalystFetchInFlightRef.current) return;

    catalystFetchInFlightRef.current = true;
    const gen = ++catalystGenRef.current;

    try {
      // Cache-only first — instant when Redis/memory is warm
      const feed = await safeJsonFetch<{ items?: CatalystItem[] }>(
        `/api/feed?moversOnly=${moversOnly}`
      );
      let data = Array.isArray(feed?.items) ? feed!.items! : null;

      if (!data || data.length === 0) {
        data = await safeJsonFetch<CatalystItem[]>(
          `/api/catalysts?moversOnly=${moversOnly}`
        );
      }
      if (!data || gen !== catalystGenRef.current) return;

      const currentSymbols = new Set(data.map((c) => c.symbol));
      const freshSymbols = new Set<string>();
      currentSymbols.forEach((symbol) => {
        if (!prevSymbolsRef.current.has(symbol)) freshSymbols.add(symbol);
      });

      if (freshSymbols.size > 0 && prevSymbolsRef.current.size > 0) {
        setNewSymbols(freshSymbols);
        if (soundEnabled) playAlertSound();
        setTimeout(() => setNewSymbols(new Set()), 5000);
      }

      prevSymbolsRef.current = currentSymbols;
      applyFeedUpdate(data);
    } catch {
      /* best effort */
    } finally {
      catalystFetchInFlightRef.current = false;
      if (catalystsRef.current.length === 0) setLoading(false);
    }
  }, [soundEnabled, moversOnly, applyFeedUpdate]);

  useEffect(() => {
    // If SSR already seeded the feed, don't hammer /api/catalysts on open —
    // SSE + a delayed poll is enough.
    const seeded = initialCatalysts.length > 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    let kickoff: ReturnType<typeof setTimeout> | null = null;

    if (seeded) {
      kickoff = setTimeout(() => void fetchCatalysts(), 4_000);
      interval = setInterval(() => void fetchCatalysts(), POLL_MS);
    } else {
      void fetchCatalysts();
      interval = setInterval(() => void fetchCatalysts(), POLL_MS);
    }

    return () => {
      if (kickoff) clearTimeout(kickoff);
      if (interval) clearInterval(interval);
      catalystGenRef.current += 1;
    };
  }, [fetchCatalysts, initialCatalysts.length]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      eventSource?.close();
      eventSource = new EventSource(`/api/catalysts/stream?moversOnly=${moversOnly}`);

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "update" && Array.isArray(data.catalysts)) {
            applyFeedUpdate(data.catalysts as CatalystItem[]);
          }
        } catch { /* ignore */ }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (catalystsRef.current.length > 0) {
          setConnected(true);
        }
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3_000);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [moversOnly, applyFeedUpdate]);

  const toggleWatchlist = useCallback(async (symbol: string) => {
    const sym = symbol.toUpperCase();
    const next = watchlist.includes(sym)
      ? watchlist.filter((s) => s !== sym)
      : [...watchlist, sym];
    setWatchlist(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: next }),
    });
  }, [watchlist]);

  const watchSet = useMemo(() => new Set(watchlist), [watchlist]);

  const filtered = useMemo(
    () =>
      catalysts
        .filter((c) => {
          if (nowMs - new Date(c.publishedAt).getTime() > MAX_FEED_AGE_MS) return false;
          if (tab === "premarket" && !c.isPremarket) return false;
          if (tab === "watchlist" && !watchSet.has(c.symbol.toUpperCase())) return false;
          return applyFilters(c, filters);
        })
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    [catalysts, nowMs, tab, watchSet, filters]
  );

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 8,
  });

  useEffect(() => {
    hotkeyRef.current = {
      filtered,
      focusIndex,
      onTabChange,
      toggleWatchlist,
    };
  }, [filtered, focusIndex, onTabChange, toggleWatchlist]);

  useEffect(() => {
    setFocusIndex(0);
    setHotkeyExpanded(false);
  }, [tab, moversOnly, filters.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        if (e.key === "Escape") el.blur();
        return;
      }

      const { filtered: rows, focusIndex: idx, onTabChange: setTab, toggleWatchlist: toggleWl } =
        hotkeyRef.current;

      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowFilters(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (e.key === "1" && setTab) {
        e.preventDefault();
        setTab("all");
        return;
      }
      if (e.key === "2" && setTab) {
        e.preventDefault();
        setTab("premarket");
        return;
      }
      if (e.key === "3" && setTab) {
        e.preventDefault();
        setTab("watchlist");
        return;
      }
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMoversOnly((v) => !v);
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setShowFilters((v) => !v);
        return;
      }
      if (rows.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(rows.length - 1, i + 1));
        setHotkeyExpanded(false);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
        setHotkeyExpanded(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setHotkeyExpanded((v) => !v);
        return;
      }
      if ((e.key === "w" || e.key === "W") && rows[idx]) {
        e.preventDefault();
        void toggleWl(rows[idx].symbol);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-focus-idx="${focusIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
    if (focusIndex >= 0 && focusIndex < filtered.length) {
      rowVirtualizer.scrollToIndex(focusIndex, { align: "auto" });
    }
  }, [focusIndex, filtered.length, rowVirtualizer]);

  const isPremarket = catalysts.some((c) => c.isPremarket);
  const tabLabel =
    tab === "premarket" ? "Premarket" : tab === "watchlist" ? "Watchlist" : "News Feed";

  const exportCsv = useCallback(() => {
    const rows = filtered.slice(0, 200).map((c) => ({
      publishedAt: c.publishedAt,
      symbol: c.symbol,
      price: c.price ?? "",
      changePercent: c.changePercent ?? "",
      rVol: c.rVol ?? "",
      catalystType: c.catalystType ?? "",
      source: c.source ?? "",
      headline: c.headline ?? "",
    }));
    const header = Object.keys(rows[0] ?? {
      publishedAt: "",
      symbol: "",
      price: "",
      changePercent: "",
      rVol: "",
      catalystType: "",
      source: "",
      headline: "",
    });
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[\",\n]/.test(s) ? `\"${s.replace(/\"/g, '\"\"')}\"` : s;
    };
    type CsvRow = (typeof rows)[number];
    const csv =
      header.join(",") +
      "\n" +
      rows
        .map((row) => header.map((key) => esc(row[key as keyof CsvRow])).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustticker-feed-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className={cn("flex flex-col min-h-0", embedded ? "h-full" : "space-y-3")}>
      <div
        className={cn(
          "scanner-toolbar flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0",
          embedded && "px-3 sm:px-4 py-2 border-b border-[--border] bg-white/[0.018]"
        )}
      >
        <div className="scanner-status min-w-0">
          <div className="flex items-center gap-2">
            {          !embedded && <h1 className="text-xl font-bold text-white">Momentum Scanner</h1>}
            {embedded && (
              <span className="desk-label">
                {tabLabel}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", connected ? "bg-[--accent] animate-pulse" : "bg-[--bear]")} />
              <span className="text-[12px] font-medium text-[--text-tertiary]">
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            {embedded && lastUpdate && mounted && (
              <span className="text-[11px] text-[--text-muted] hidden sm:inline font-mono tabular-nums">
                {filtered.length} items · {formatClockTime(lastUpdate)}
              </span>
            )}
          </div>
          {!embedded && lastUpdate && mounted && (
            <p className="text-[11px] text-zinc-600 mt-0.5">
              {moversOnly ? "Movers with news" : "All verified catalysts"} · newest first ·{" "}
              {formatClockTime(lastUpdate)}
            </p>
          )}
        </div>

        <div className="scanner-actions flex items-center gap-1.5 flex-wrap">
          {isPremarket && tab !== "premarket" && (
            <Badge variant="urgent" className="text-[10px]">
              <Sun className="w-3 h-3" /> Premarket active
            </Badge>
          )}
          {tab === "watchlist" && (
            <Badge variant="neutral" className="text-[10px]">
              <Star className="w-3 h-3" /> {watchlist.length} tickers
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Mute alerts" : "Enable sound alerts"}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-zinc-600" />
            )}
          </Button>
          <Button
            variant={moversOnly ? "default" : "secondary"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setMoversOnly(!moversOnly)}
          >
            {moversOnly ? "Movers" : "All"}
          </Button>
          <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="w-3.5 h-3.5" /> Filter
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={exportCsv}
            title="Download the current feed as CSV"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void fetchCatalysts()}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-[var(--radius-inner)] border border-[--border-medium] bg-[--bg-elevated] p-3 sm:p-4 space-y-3 mx-3 sm:mx-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search ticker or headline... (/)"
              className="w-full pl-8 pr-3 py-1.5 rounded-md bg-zinc-800/80 border border-zinc-700/80 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              value={filters.search || ""}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <FilterInput
              label="Min price $"
              value={filters.minPrice}
              onChange={(v) => setFilters({ ...filters, minPrice: v })}
            />
            <FilterInput
              label="Max price $"
              value={filters.maxPrice}
              onChange={(v) => setFilters({ ...filters, maxPrice: v })}
            />
            <FilterInput
              label="Min float (M)"
              value={filters.minFloatM}
              onChange={(v) => setFilters({ ...filters, minFloatM: v })}
            />
            <FilterInput
              label="Max float (M)"
              value={filters.maxFloatM}
              onChange={(v) => setFilters({ ...filters, maxFloatM: v })}
            />
            <FilterInput
              label="Min chg %"
              value={filters.minChange}
              onChange={(v) => setFilters({ ...filters, minChange: v })}
            />
            <FilterInput
              label="Max chg %"
              value={filters.maxChange}
              onChange={(v) => setFilters({ ...filters, maxChange: v })}
            />
            <FilterInput
              label="Min RVol ×"
              value={filters.minRvol}
              onChange={(v) => setFilters({ ...filters, minRvol: v })}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={filters.premarketOnly}
              onClick={() => setFilters({ ...filters, premarketOnly: !filters.premarketOnly })}
            >
              <Sun className="w-3 h-3" /> Premarket only
            </FilterChip>
            <FilterChip
              active={filters.minUrgency === 70}
              onClick={() => setFilters({ ...filters, minUrgency: filters.minUrgency === 70 ? undefined : 70 })}
            >
              <Radio className="w-3 h-3" /> Urgent
            </FilterChip>
            <FilterChip
              active={filters.minSentiment === 40}
              onClick={() => setFilters({ ...filters, minSentiment: filters.minSentiment === 40 ? undefined : 40 })}
            >
              Bullish
            </FilterChip>
            {CATALYST_TYPES.map((type) => (
              <FilterChip
                key={type.id}
                active={filters.catalystTypes?.includes(type.id)}
                onClick={() => {
                  const types = filters.catalystTypes || [];
                  const next = types.includes(type.id)
                    ? types.filter((t) => t !== type.id)
                    : [...types, type.id];
                  setFilters({ ...filters, catalystTypes: next.length ? next : undefined });
                }}
              >
                {type.icon} {type.label}
              </FilterChip>
            ))}
            <FilterChip active={false} onClick={() => setFilters({})}>
              Clear all
            </FilterChip>
          </div>
        </div>
      )}

      {!embedded && <DisclaimerBanner compact />}

      <div
        className={cn(
          "overflow-hidden flex flex-col min-h-0 flex-1",
          !embedded && "desk-panel"
        )}
      >
        <div className="hidden sm:grid grid-cols-[80px_54px_58px_44px_44px_1fr_54px_28px] gap-2 px-4 py-2.5 border-b border-[--border] bg-white/[0.018] text-[11px] uppercase tracking-widest text-[--text-muted] font-semibold shrink-0">
          <span>Ticker</span>
          <span className="text-center">Chg</span>
          <span className="text-right">Price</span>
          <span className="text-center">RVol</span>
          <span className="text-center">Sent</span>
          <span>Headline</span>
          <span className="text-right">Newest</span>
          <span />
        </div>

        {loading && catalysts.length === 0 ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/[0.03] animate-pulse rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Moon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {tab === "watchlist"
                ? watchlist.length === 0
                  ? "Add tickers from Settings or expand any row"
                  : "No news on your watchlist right now"
                : tab === "premarket"
                  ? "No premarket catalysts right now"
                  : moversOnly
                    ? "No big movers with news right now"
                    : "No catalysts match your filters"}
            </p>
          </div>
        ) : (
          <div ref={listRef} className="scanner-list flex-1 min-h-0 overflow-y-auto">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const catalyst = filtered[virtualRow.index];
                const idx = virtualRow.index;
                return (
                  <div
                    key={`${catalyst.id}-${catalyst.symbol}`}
                    data-focus-idx={idx}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <CatalystCard
                      catalyst={catalyst}
                      isNew={newSymbols.has(catalyst.symbol)}
                      inWatchlist={watchSet.has(catalyst.symbol.toUpperCase())}
                      onWatchlistToggle={toggleWatchlist}
                      highlighted={idx === focusIndex}
                      forceExpanded={idx === focusIndex ? hotkeyExpanded : false}
                      nowMs={nowMs}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {embedded && (
        <p className="scanner-hotkeys text-[9px] text-zinc-600 text-center shrink-0 px-2 pb-1">
          j/k navigate · Enter expand · w watchlist · 1/2/3 tabs · / search · m movers
        </p>
      )}
    </div>
  );
}

function applyFilters(c: CatalystItem, filters: ScannerFilters): boolean {
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const inHeadline =
      c.symbol.toLowerCase().includes(q) ||
      c.headline.toLowerCase().includes(q) ||
      (c.headlines?.some((h) => h.headline.toLowerCase().includes(q)) ?? false);
    if (!inHeadline) return false;
  }
  if (filters.minSentiment != null && (c.sentimentScore ?? 0) < filters.minSentiment) return false;
  if (filters.maxSentiment != null && (c.sentimentScore ?? 0) > filters.maxSentiment) return false;
  if (filters.premarketOnly && !c.isPremarket) return false;
  if (filters.minUrgency != null && (c.urgencyScore ?? 0) < filters.minUrgency) return false;
  if (filters.catalystTypes?.length) {
    const types = new Set(
      [c.catalystType, ...(c.headlines?.map((h) => h.catalystType) ?? [])].filter(Boolean)
    );
    if (!filters.catalystTypes.some((t) => types.has(t))) return false;
  }
  if (filters.minPrice != null && (c.price ?? 0) < filters.minPrice) return false;
  if (filters.maxPrice != null && (c.price ?? Infinity) > filters.maxPrice) return false;
  if (filters.minFloatM != null) {
    const floatM = (c.floatShares ?? 0) / 1e6;
    if (floatM < filters.minFloatM) return false;
  }
  if (filters.maxFloatM != null) {
    const floatM = (c.floatShares ?? Infinity) / 1e6;
    if (floatM > filters.maxFloatM) return false;
  }
  if (filters.minChange != null && (c.changePercent ?? 0) < filters.minChange) return false;
  if (filters.maxChange != null && (c.changePercent ?? 0) > filters.maxChange) return false;
  if (filters.minRvol != null && (c.rVol ?? 0) < filters.minRvol) return false;
  return true;
}

function FilterInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="text-[9px] text-zinc-500 uppercase tracking-wide">{label}</span>
      <input
        type="number"
        step="any"
        className="mt-0.5 w-full px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/80 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </label>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors",
        active
          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
          : "bg-zinc-800/60 text-zinc-400 border-zinc-700/80 hover:border-zinc-600"
      )}
    >
      {children}
    </button>
  );
}

function playAlertSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* audio not available */ }
}
