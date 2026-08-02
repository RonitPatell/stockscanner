"use client";

/**
 * Main trader desk — Arcane-style floor: movers tables, wire, news, chart.
 * Plain language; no dilution/plan/autopsy chrome.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalystItem, MarketAlert, MarketScannerSnapshot, VolumeLeader } from "@/types";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import { tradingViewUrl } from "@/lib/chart-links";
import { ACTIVE_US_TICKERS } from "@/lib/news-sources/active-tickers";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import {
  pickLiveField,
  useLiveQuotes,
  useRegisterLiveSymbols,
  type LiveQuote,
} from "../LiveQuoteProvider";
import { TradingViewMiniChart } from "../TradingViewMiniChart";
import {
  formatMarketCap,
  leadersFromLiveQuotes,
  mergeStickyLeaders,
  stickyToSorted,
  type StickyLeader,
} from "./floor-movers";

function formatVol(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}

function formatFloat(shares: number | null | undefined): string {
  if (shares == null || !(shares > 0)) return "—";
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`;
  if (shares >= 1e6) return `${(shares / 1e6).toFixed(1)}M`;
  if (shares >= 1e3) return `${(shares / 1e3).toFixed(0)}K`;
  return String(Math.round(shares));
}

function formatTicks(n: number | null | undefined): string {
  if (n == null || !(n > 0)) return "—";
  return formatVol(n);
}

function alertAge(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

const SESSION_LABELS = {
  premarket: "Pre-market",
  regular: "Regular",
  afterhours: "After hours",
  closed: "Closed",
} as const;

const UNIVERSE = [...new Set(ACTIVE_US_TICKERS)];
const UNIVERSE_BATCH = 48;

export function TradingFloor({
  initialScanner = null,
  initialCatalysts = [],
  onSymbolSelect,
  lookupSymbol: lookupSymbolProp = null,
  onLookupHandled,
  className,
}: {
  initialScanner?: MarketScannerSnapshot | null;
  initialCatalysts?: CatalystItem[];
  onSymbolSelect?: (symbol: string, catalyst?: CatalystItem | null) => void;
  /** Top-bar / parent ticker lookup (does not filter the session news tape). */
  lookupSymbol?: string | null;
  onLookupHandled?: () => void;
  className?: string;
}) {
  const [snapshotMeta, setSnapshotMeta] = useState<{
    scannedAt?: string;
    marketSession: MarketScannerSnapshot["marketSession"];
    alerts: MarketAlert[];
  }>(() => ({
    scannedAt: initialScanner?.scannedAt,
    marketSession: initialScanner?.marketSession ?? "closed",
    alerts: initialScanner?.alerts ?? [],
  }));
  const [catalysts, setCatalysts] = useState<CatalystItem[]>(initialCatalysts);
  const [loading, setLoading] = useState(!initialScanner);
  const [selected, setSelected] = useState<string>(
    () =>
      initialScanner?.volumeLeaders[0]?.symbol ??
      initialCatalysts[0]?.symbol ??
      "SPY"
  );
  const [moverSort, setMoverSort] = useState<"volume" | "change">("volume");
  const [lookupSym, setLookupSym] = useState<string | null>(null);
  const [symbolNews, setSymbolNews] = useState<CatalystItem[]>([]);
  const [lookupProfile, setLookupProfile] = useState<{
    floatShares?: number;
    marketCap?: number;
    volume?: number;
    rVol?: number;
    price?: number;
    changePercent?: number;
  } | null>(null);
  const [leaders, setLeaders] = useState<VolumeLeader[]>(
    () => initialScanner?.volumeLeaders ?? []
  );
  const [watchSymbols, setWatchSymbols] = useState<string[]>(() =>
    UNIVERSE.slice(0, UNIVERSE_BATCH)
  );
  const stickyRef = useRef<Map<string, StickyLeader>>(new Map());
  const universeCursorRef = useRef(0);

  const applyIncomingLeaders = useCallback((incoming: VolumeLeader[]) => {
    if (incoming.length === 0) return;
    stickyRef.current = mergeStickyLeaders(stickyRef.current, incoming);
    setLeaders(stickyToSorted(stickyRef.current));
  }, []);

  // Seed sticky map from SSR scanner once
  useEffect(() => {
    if (initialScanner?.volumeLeaders?.length) {
      applyIncomingLeaders(
        initialScanner.volumeLeaders.map((r) => ({ ...r, source: "scanner" as const }))
      );
    }
  }, [initialScanner, applyIncomingLeaders]);

  const refresh = useCallback(async () => {
    try {
      const cursor = universeCursorRef.current;
      const batch: string[] = [];
      for (let i = 0; i < UNIVERSE_BATCH && i < UNIVERSE.length; i++) {
        batch.push(UNIVERSE[(cursor + i) % UNIVERSE.length]!);
      }
      setWatchSymbols(batch);

      const [scanRes, feedRes, quoteRes] = await Promise.all([
        fetch("/api/scanner"),
        fetch("/api/feed?moversOnly=false"),
        fetch(
          `/api/quotes?symbols=${batch.join(",")}&max=${batch.length}&needRvol=1&needProfile=1`
        ),
      ]);

      if (scanRes.ok) {
        const data = (await scanRes.json()) as MarketScannerSnapshot & {
          alerts?: MarketAlert[];
        };
        setSnapshotMeta((prev) => ({
          scannedAt: data.scannedAt ?? prev.scannedAt,
          marketSession: data.marketSession ?? prev.marketSession,
          // Keep prior alerts if the worker returns an empty wire
          alerts:
            Array.isArray(data.alerts) && data.alerts.length > 0
              ? data.alerts
              : prev.alerts,
        }));
        if (Array.isArray(data.volumeLeaders) && data.volumeLeaders.length > 0) {
          applyIncomingLeaders(
            data.volumeLeaders.map((r) => ({ ...r, source: "scanner" as const }))
          );
        }
      }

      if (feedRes.ok) {
        const data = (await feedRes.json()) as { items?: CatalystItem[] };
        // Never wipe the running tape with an empty poll
        if (Array.isArray(data.items) && data.items.length > 0) {
          setCatalysts(data.items.slice(0, 100));
        }
      }

      if (quoteRes.ok) {
        const data = (await quoteRes.json()) as {
          quotes?: Record<string, LiveQuote>;
        };
        if (data.quotes) {
          applyIncomingLeaders(leadersFromLiveQuotes(data.quotes));
        }
      }

      universeCursorRef.current =
        (cursor + UNIVERSE_BATCH) % Math.max(1, UNIVERSE.length);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [applyIncomingLeaders]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    void import("../TradingViewMiniChart").then((m) =>
      m.prefetchTradingViewScript?.()
    );
  }, []);

  const lookupTicker = useCallback(
    async (raw: string) => {
      const token = raw.trim().toUpperCase().replace(/^\$/, "");
      const sym = token.split(/\s+/)[0] ?? "";
      if (!sym || !isValidTickerFormat(sym)) return;
      setSelected(sym);
      setLookupSym(sym);
      onSymbolSelect?.(sym, catalysts.find((c) => c.symbol === sym) ?? null);

      try {
        const res = await fetch(
          `/api/quotes?symbols=${encodeURIComponent(sym)}&max=1&needRvol=1&needProfile=1`
        );
        if (res.ok) {
          const data = (await res.json()) as {
            quotes?: Record<string, LiveQuote>;
          };
          const q = data.quotes?.[sym];
          if (q) {
            setLookupProfile({
              floatShares: q.floatShares,
              marketCap: q.marketCap,
              volume: q.volume,
              rVol: q.rVol ?? undefined,
              price: q.price,
              changePercent: q.changePercent,
            });
            applyIncomingLeaders([
              {
                symbol: sym,
                price: q.price,
                changePercent: q.changePercent,
                volume: q.volume ?? 0,
                avgVolume: q.avgVolume ?? 0,
                rVol: q.rVol && q.rVol > 0 ? q.rVol : 1,
                dayHigh: q.dayHigh ?? q.price,
                nearHod: false,
                floatShares: q.floatShares,
                marketCap: q.marketCap,
                source: "lookup",
              },
            ]);
          } else {
            setLookupProfile(null);
          }
        }
      } catch {
        setLookupProfile(null);
      }

      // Symbol news from the running tape — do not replace session catalysts
      setSymbolNews(
        catalysts
          .filter((c) => c.symbol === sym)
          .slice(0, 20)
      );
      onLookupHandled?.();
    },
    [applyIncomingLeaders, catalysts, onLookupHandled, onSymbolSelect]
  );

  useEffect(() => {
    if (!lookupSymbolProp) return;
    void lookupTicker(lookupSymbolProp);
    // Only react to the parent token — not feed rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupSymbolProp]);

  // Refresh symbol-specific headlines when the tape updates (tape itself stays intact)
  useEffect(() => {
    if (!lookupSym) return;
    setSymbolNews(
      catalysts.filter((c) => c.symbol === lookupSym).slice(0, 20)
    );
  }, [catalysts, lookupSym]);

  const alerts = snapshotMeta.alerts;
  const session = snapshotMeta.marketSession;

  const gappers = useMemo(
    () =>
      [...leaders]
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 24),
    [leaders]
  );

  const hotByRvol = useMemo(() => leaders.slice(0, 24), [leaders]);

  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const s of watchSymbols) set.add(s);
    for (const l of leaders) set.add(l.symbol);
    for (const a of alerts.slice(0, 40)) set.add(a.symbol);
    if (selected) set.add(selected);
    return [...set];
  }, [watchSymbols, leaders, alerts, selected]);

  useRegisterLiveSymbols("trading-floor", symbols);
  const liveQuotes = useLiveQuotes();

  const pick = useCallback(
    (symbol: string) => {
      setSelected(symbol);
      setLookupSym(symbol);
      const cat = catalysts.find((c) => c.symbol === symbol) ?? null;
      onSymbolSelect?.(symbol, cat);
      setSymbolNews(
        catalysts.filter((c) => c.symbol === symbol).slice(0, 20)
      );
      const q = liveQuotes[symbol.toUpperCase()];
      if (q) {
        setLookupProfile({
          floatShares: q.floatShares,
          marketCap: q.marketCap,
          volume: q.volume,
          rVol: q.rVol ?? undefined,
          price: q.price,
          changePercent: q.changePercent,
        });
      }
    },
    [catalysts, liveQuotes, onSymbolSelect]
  );

  const focusLeader =
    leaders.find((l) => l.symbol === selected) ?? leaders[0] ?? null;
  const focusHeadline =
    catalysts.find((c) => c.symbol === selected)?.headline ??
    alerts.find((a) => a.symbol === selected)?.message ??
    null;

  // Session tape — never filtered by search; selected names floated to top only
  const sessionNews = useMemo(() => {
    const scored = catalysts.map((c) => ({
      c,
      hot: c.symbol === selected,
    }));
    scored.sort((a, b) => {
      if (a.hot !== b.hot) return a.hot ? -1 : 1;
      return (
        new Date(b.c.publishedAt).getTime() - new Date(a.c.publishedAt).getTime()
      );
    });
    return scored.map((s) => s.c).slice(0, 50);
  }, [catalysts, selected]);

  return (
    <div
      className={cn("tt-floor flex flex-col min-h-0 h-full", className)}
      data-testid="trading-floor"
      data-guide="trading-floor"
    >
      <header className="tt-floor__chrome shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--background)]">
        <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
          Trading floor
        </h2>
        <p className="text-[11px] text-zinc-500">
          Market-wide volume (not news-only) · search any ticker · session news keeps running
        </p>
        <span className="ml-auto text-[11px] font-mono text-zinc-500">
          {SESSION_LABELS[session]}
          {snapshotMeta.scannedAt
            ? ` · updated ${alertAge(snapshotMeta.scannedAt)} ago`
            : loading
              ? " · connecting…"
              : ""}
          {leaders.length ? ` · ${leaders.length} names sticky` : ""}
        </span>
      </header>

      <div className="tt-floor__grid flex-1 min-h-0 p-2 gap-2">
        {/* Left rail: volume/% movers (tabbed) + wire */}
        <aside className="tt-floor__rail min-h-0 flex flex-col gap-2">
          <section
            className="tt-floor__panel flex-1 min-h-0 flex flex-col"
            data-guide={moverSort === "volume" ? "floor-movers" : "floor-gappers"}
          >
            <header className="shrink-0 border-b border-[var(--border)]">
              <div
                className="flex items-center gap-0.5 px-1.5 pt-1.5"
                role="tablist"
                aria-label="Mover list sort"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={moverSort === "volume"}
                  data-active={moverSort === "volume" ? "true" : "false"}
                  data-testid="floor-sort-volume"
                  onClick={() => setMoverSort("volume")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    moverSort === "volume"
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Volume
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={moverSort === "change"}
                  data-active={moverSort === "change" ? "true" : "false"}
                  data-testid="floor-sort-change"
                  onClick={() => setMoverSort("change")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    moverSort === "change"
                      ? "bg-emerald-500/15 text-emerald-200"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Biggest %
                </button>
              </div>
              <p className="px-2.5 pb-1.5 text-[10px] text-zinc-600">
                {moverSort === "volume"
                  ? "Highest relative volume — news not required"
                  : "Largest % moves — same full-height list"}
              </p>
            </header>
            <MoverTable
              rows={moverSort === "volume" ? hotByRvol : gappers}
              liveQuotes={liveQuotes}
              selected={selected}
              onSelect={pick}
              empty={
                loading
                  ? "Scanning liquid universe…"
                  : moverSort === "volume"
                    ? "Waiting for market quotes…"
                    : "No movers yet"
              }
            />
          </section>
          <section
            className="tt-floor__panel flex-1 min-h-0 flex flex-col"
            data-guide="floor-wire"
          >
            <PanelTitle title="Wire" sub="Volume / momentum / highs" />
            <WireList
              alerts={alerts}
              liveQuotes={liveQuotes}
              selected={selected}
              onSelect={pick}
              empty={
                loading
                  ? "Connecting wire…"
                  : "No alerts yet — desk stays quiet until something moves"
              }
            />
          </section>
        </aside>

        {/* Main stage: big chart + news always side by side */}
        <section className="tt-floor__stage min-h-0 flex flex-col gap-2">
          <div
            className="tt-floor__panel shrink-0"
            data-guide="floor-focus"
          >
            <FocusCard
              leader={focusLeader}
              symbol={selected}
              liveQuotes={liveQuotes}
              headline={focusHeadline}
              lookupProfile={lookupProfile}
              isLookup={lookupSym === selected}
            />
          </div>

          <div className="tt-floor__chart-news flex-1 min-h-0 grid gap-2">
            <div
              className="tt-floor__panel flex flex-col min-h-0"
              data-guide="live-tape-chart"
            >
              <PanelTitle
                title={`Chart · ${selected}`}
                sub="Scroll or pinch to zoom · drag to pan"
              />
              <div className="flex-1 min-h-[420px] px-1 pb-1">
                <TradingViewMiniChart
                  symbol={selected}
                  height={520}
                  interactive
                  className="h-full"
                />
              </div>
            </div>

            <div
              className="tt-floor__panel flex flex-col min-h-0"
              data-guide="news-feed"
            >
              {lookupSym ? (
                <div className="shrink-0 border-b border-[var(--border)] max-h-[40%] flex flex-col min-h-0">
                  <PanelTitle
                    title={`News · ${lookupSym}`}
                    sub="For your search — session tape below keeps running"
                  />
                  <NewsList
                    items={symbolNews}
                    selected={selected}
                    onSelect={pick}
                    empty={`No headlines for ${lookupSym} in this session yet`}
                  />
                </div>
              ) : null}
              <PanelTitle
                title="Session news"
                sub="Running tape — not filtered by search"
              />
              <NewsList
                items={sessionNews}
                selected={selected}
                onSelect={pick}
                empty={loading ? "Loading news…" : "No session headlines yet"}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PanelTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="shrink-0 flex items-baseline justify-between gap-2 px-2.5 py-1.5 border-b border-[var(--border)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
        {title}
      </h3>
      <p className="text-[10px] text-zinc-600 truncate hidden sm:block">{sub}</p>
    </header>
  );
}

function FocusCard({
  leader,
  symbol,
  liveQuotes,
  headline,
  lookupProfile,
  isLookup,
}: {
  leader: VolumeLeader | null;
  symbol: string;
  liveQuotes: Record<string, LiveQuote>;
  headline: string | null;
  lookupProfile: {
    floatShares?: number;
    marketCap?: number;
    volume?: number;
    rVol?: number;
    price?: number;
    changePercent?: number;
  } | null;
  isLookup: boolean;
}) {
  const price =
    pickLiveField(symbol, liveQuotes, "price", lookupProfile?.price ?? leader?.price) ??
    lookupProfile?.price ??
    leader?.price ??
    null;
  const chg =
    pickLiveField(
      symbol,
      liveQuotes,
      "changePercent",
      lookupProfile?.changePercent ?? leader?.changePercent
    ) ??
    lookupProfile?.changePercent ??
    leader?.changePercent ??
    null;
  const rVol =
    pickLiveField(symbol, liveQuotes, "rVol", lookupProfile?.rVol ?? leader?.rVol) ??
    lookupProfile?.rVol ??
    leader?.rVol ??
    null;
  const vol =
    pickLiveField(symbol, liveQuotes, "volume", lookupProfile?.volume ?? leader?.volume) ??
    lookupProfile?.volume ??
    leader?.volume ??
    null;
  const floatShares =
    pickLiveField(
      symbol,
      liveQuotes,
      "floatShares",
      lookupProfile?.floatShares ?? leader?.floatShares
    ) ??
    lookupProfile?.floatShares ??
    leader?.floatShares ??
    null;
  const marketCap =
    pickLiveField(symbol, liveQuotes, "marketCap", lookupProfile?.marketCap ?? leader?.marketCap) ??
    lookupProfile?.marketCap ??
    leader?.marketCap ??
    null;

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <a
              href={tradingViewUrl(symbol)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-2xl font-bold text-white hover:text-emerald-300"
            >
              {symbol}
            </a>
            {isLookup ? (
              <span className="text-[10px] uppercase tracking-wide text-emerald-400/90 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                Search
              </span>
            ) : null}
          </div>
          {headline ? (
            <p className="text-[12px] text-zinc-400 line-clamp-2 mt-0.5">
              {headline}
            </p>
          ) : (
            <p className="text-[12px] text-zinc-600 mt-0.5">
              No headline required — chart and stats still load for any ticker.
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-xl text-zinc-100 tabular-nums">
            {price != null && price > 0 ? formatPrice(price) : "—"}
          </div>
          <div
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              (chg ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {chg != null ? formatPercent(chg) : "—"}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
        <Stat label="Volume" value={formatVol(vol ?? 0)} />
        <Stat label="RVol" value={rVol != null && rVol > 0 ? `${rVol.toFixed(1)}×` : "—"} />
        <Stat label="Float" value={formatFloat(floatShares)} />
        <Stat label="Mkt cap" value={formatMarketCap(marketCap)} />
        <Stat
          label="Ticks"
          value={formatTicks(leader?.ticks)}
          hint="Print count when the feed sends it"
        />
        <Stat
          label="Price"
          value={price != null && price > 0 ? formatPrice(price) : "—"}
        />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <dt className="text-zinc-600 uppercase tracking-wide text-[10px]">{label}</dt>
      <dd className="font-mono text-zinc-200 tabular-nums">{value}</dd>
    </div>
  );
}

function MoverTable({
  rows,
  liveQuotes,
  selected,
  onSelect,
  empty,
  compact,
}: {
  rows: VolumeLeader[];
  liveQuotes: Record<string, LiveQuote>;
  selected: string;
  onSelect: (symbol: string) => void;
  empty: string;
  compact?: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div
        className={cn(
          "shrink-0 grid gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-600 font-semibold border-b border-[var(--border)]/80",
          "grid-cols-[minmax(52px,1fr)_52px_52px_44px_48px_44px_56px]"
        )}
      >
        <span>Sym</span>
        <span className="text-right">Chg%</span>
        <span className="text-right">Vol</span>
        <span className="text-right" title="Trade prints when available">
          Ticks
        </span>
        <span className="text-right">Float</span>
        <span className="text-right">RVol</span>
        <span className="text-right">Price</span>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-[12px] text-zinc-600 text-center">{empty}</li>
        ) : (
          rows.map((row) => (
            <MoverRow
              key={row.symbol}
              row={row}
              liveQuotes={liveQuotes}
              active={selected === row.symbol}
              onSelect={onSelect}
              compact={compact}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function MoverRow({
  row,
  liveQuotes,
  active,
  onSelect,
  compact,
}: {
  row: VolumeLeader;
  liveQuotes: Record<string, LiveQuote>;
  active: boolean;
  onSelect: (symbol: string) => void;
  compact?: boolean;
}) {
  const price =
    pickLiveField(row.symbol, liveQuotes, "price", row.price) ?? row.price;
  const chg =
    pickLiveField(row.symbol, liveQuotes, "changePercent", row.changePercent) ??
    row.changePercent;
  const rVol =
    pickLiveField(row.symbol, liveQuotes, "rVol", row.rVol) ?? row.rVol;
  const floatShares =
    pickLiveField(row.symbol, liveQuotes, "floatShares", row.floatShares) ??
    row.floatShares;
  const vol =
    pickLiveField(row.symbol, liveQuotes, "volume", row.volume) ?? row.volume;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(row.symbol)}
        className={cn(
          "w-full grid gap-1 items-center px-2 text-left font-mono text-[12px] tabular-nums border-b border-[var(--border)]/50 hover:bg-white/[0.03]",
          "grid-cols-[minmax(52px,1fr)_52px_52px_44px_48px_44px_56px]",
          compact ? "py-1" : "py-1.5",
          active && "bg-emerald-500/10 border-l-2 border-l-emerald-400"
        )}
      >
        <span className="font-bold text-zinc-100 truncate flex items-center gap-1">
          {row.symbol}
          {row.nearHod ? (
            <span className="text-[9px] text-emerald-400 font-sans font-bold">HOD</span>
          ) : null}
        </span>
        <span
          className={cn(
            "text-right font-semibold",
            chg >= 0 ? "text-emerald-400" : "text-red-400"
          )}
        >
          {formatPercent(chg)}
        </span>
        <span className="text-right text-zinc-400">{formatVol(vol)}</span>
        <span className="text-right text-zinc-500">{formatTicks(row.ticks)}</span>
        <span className="text-right text-zinc-400">{formatFloat(floatShares)}</span>
        <span
          className={cn(
            "text-right font-semibold",
            rVol >= 5 ? "text-amber-400" : rVol >= 3 ? "text-orange-400" : "text-zinc-400"
          )}
        >
          {rVol > 0 ? `${rVol.toFixed(1)}×` : "—"}
        </span>
        <span className="text-right text-zinc-200">{formatPrice(price)}</span>
      </button>
    </li>
  );
}

function WireList({
  alerts,
  liveQuotes,
  selected,
  onSelect,
  empty,
}: {
  alerts: MarketAlert[];
  liveQuotes: Record<string, LiveQuote>;
  selected: string;
  onSelect: (symbol: string) => void;
  empty: string;
}) {
  return (
    <ul className="flex-1 min-h-0 overflow-y-auto">
      {alerts.length === 0 ? (
        <li className="px-3 py-6 text-[12px] text-zinc-600 text-center">{empty}</li>
      ) : (
        alerts.slice(0, 60).map((a) => {
          const chg =
            pickLiveField(a.symbol, liveQuotes, "changePercent", a.changePercent) ??
            a.changePercent;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a.symbol)}
                className={cn(
                  "w-full text-left px-2.5 py-2 border-b border-[var(--border)]/50 hover:bg-white/[0.03]",
                  selected === a.symbol && "bg-emerald-500/10"
                )}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-bold text-zinc-100">{a.symbol}</span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      chg >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(chg)}
                  </span>
                  <span className="ml-auto text-zinc-600 font-mono">
                    {alertAge(a.timestamp)}
                  </span>
                </div>
                <p className="text-[12px] text-zinc-400 line-clamp-2 mt-0.5">
                  {a.message}
                </p>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );
}

function NewsList({
  items,
  selected,
  onSelect,
  empty,
}: {
  items: CatalystItem[];
  selected: string;
  onSelect: (symbol: string) => void;
  empty: string;
}) {
  return (
    <ul className="flex-1 min-h-0 overflow-y-auto">
      {items.length === 0 ? (
        <li className="px-3 py-6 text-[12px] text-zinc-600 text-center">{empty}</li>
      ) : (
        items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.symbol)}
              className={cn(
                "w-full text-left px-2.5 py-2 border-b border-[var(--border)]/50 hover:bg-white/[0.03]",
                selected === c.symbol && "bg-emerald-500/10"
              )}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-bold text-zinc-100">{c.symbol}</span>
                {c.changePercent != null ? (
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      c.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(c.changePercent)}
                  </span>
                ) : null}
                <span className="ml-auto text-zinc-600 font-mono">
                  {alertAge(
                    typeof c.publishedAt === "string"
                      ? c.publishedAt
                      : new Date(c.publishedAt).toISOString()
                  )}
                </span>
              </div>
              <p className="text-[12px] text-zinc-400 line-clamp-2 mt-0.5">
                {c.headline}
              </p>
            </button>
          </li>
        ))
      )}
    </ul>
  );
}
