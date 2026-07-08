"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio,
  Filter,
  RefreshCw,
  Search,
  Sun,
  Moon,
  Volume2,
  Star,
} from "lucide-react";
import { CatalystCard } from "./CatalystCard";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { CatalystItem, ScannerFilters } from "@/types";
import { CATALYST_TYPES } from "@/types";
import { cn } from "@/lib/utils";

export type ScannerTab = "all" | "premarket" | "watchlist";

const POLL_MS = 20_000;

export function LiveScanner({
  embedded = false,
  tab = "all",
}: {
  embedded?: boolean;
  tab?: ScannerTab;
}) {
  const [catalysts, setCatalysts] = useState<CatalystItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newSymbols, setNewSymbols] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ScannerFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [moversOnly, setMoversOnly] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const prevSymbolsRef = useRef<Set<string>>(new Set());

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setWatchlist((data.watchlist ?? []).map((s: string) => s.toUpperCase()));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const fetchCatalysts = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`/api/catalysts?moversOnly=${moversOnly}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data: CatalystItem[] = await res.json();

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
      setCatalysts(data);
      setLastUpdate(new Date());
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [soundEnabled, moversOnly]);

  useEffect(() => {
    fetchCatalysts();
    const interval = setInterval(fetchCatalysts, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchCatalysts]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/catalysts/stream?moversOnly=${moversOnly}`);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "update" && Array.isArray(data.catalysts)) {
          setCatalysts(data.catalysts);
          setLastUpdate(new Date());
          setConnected(true);
        }
      } catch { /* ignore */ }
    };
    eventSource.onerror = () => setConnected(false);
    return () => eventSource.close();
  }, [moversOnly]);

  const toggleWatchlist = async (symbol: string) => {
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
  };

  const watchSet = new Set(watchlist);

  const filtered = catalysts
    .filter((c) => {
      if (tab === "premarket" && !c.isPremarket) return false;
      if (tab === "watchlist" && !watchSet.has(c.symbol.toUpperCase())) return false;
      return applyFilters(c, filters);
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const isPremarket = catalysts.some((c) => c.isPremarket);
  const tabLabel =
    tab === "premarket" ? "Premarket" : tab === "watchlist" ? "Watchlist" : "News Feed";

  return (
    <div className={cn("flex flex-col min-h-0", embedded ? "h-full" : "space-y-3")}>
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0",
          embedded && "px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-900/50"
        )}
      >
        <div>
          <div className="flex items-center gap-2">
            {!embedded && <h1 className="text-xl font-bold text-white">Momentum Scanner</h1>}
            {embedded && (
              <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wide">
                {tabLabel}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                {connected ? "Live" : "Offline"}
              </span>
            </div>
            {embedded && lastUpdate && (
              <span className="text-[9px] text-zinc-600 hidden sm:inline">
                {filtered.length} · {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
          {!embedded && lastUpdate && (
            <p className="text-[11px] text-zinc-600 mt-0.5">
              {moversOnly ? "Movers with news" : "All verified catalysts"} · newest first ·{" "}
              {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
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
            <Volume2 className={cn("w-3.5 h-3.5", soundEnabled ? "text-emerald-400" : "text-zinc-600")} />
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
          <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={fetchCatalysts}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-3 mx-2.5 sm:mx-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search ticker or headline..."
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
          !embedded && "rounded-lg border border-zinc-800 bg-zinc-950/50"
        )}
      >
        <div className="hidden sm:grid grid-cols-[72px_48px_52px_40px_40px_1fr_48px_24px] gap-1.5 px-2.5 py-1 border-b border-zinc-800 bg-zinc-900/60 text-[9px] uppercase tracking-wider text-zinc-500 font-medium shrink-0">
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
          <div>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-11 border-b border-zinc-800/50 bg-zinc-900/20 animate-pulse" />
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
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filtered.map((catalyst) => (
              <CatalystCard
                key={`${catalyst.id}-${catalyst.symbol}`}
                catalyst={catalyst}
                isNew={newSymbols.has(catalyst.symbol)}
                inWatchlist={watchSet.has(catalyst.symbol.toUpperCase())}
                onWatchlistToggle={toggleWatchlist}
              />
            ))}
          </div>
        )}
      </div>

      {embedded && (
        <p className="text-[9px] text-zinc-600 text-center shrink-0 px-2 pb-1">
          Click ticker → TradingView chart · expand row for Finviz &amp; watchlist
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
