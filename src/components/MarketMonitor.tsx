"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  Flame,
  TrendingUp,
  BarChart3,
  Radio,
  Target,
  Zap,
  CalendarDays,
  Gauge,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { EarningsEvent, MarketAlert, MarketScannerSnapshot, VolumeLeader } from "@/types";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import { tradingViewUrl } from "@/lib/chart-links";
import { pickLiveField, useLiveQuotes, useRegisterLiveSymbols, type LiveQuote } from "./LiveQuoteProvider";

const SESSION_LABELS = {
  premarket: "Pre-Market",
  regular: "Regular",
  afterhours: "After Hours",
  closed: "Closed",
} as const;

const MARKET_STATE_SYMBOLS = [
  "VIX",
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLY",
  "XLP",
  "XLC",
  "XLU",
  "XLB",
] as const;

export type PopoutPanelId = "wire-alerts" | "volume" | "market-state" | "earnings";

export const POPOUT_PANELS: Record<
  PopoutPanelId,
  { title: string; width: number; height: number }
> = {
  "wire-alerts": { title: "Wire Alerts", width: 520, height: 780 },
  volume: { title: "Heavy Volume", width: 560, height: 780 },
  "market-state": { title: "Market State", width: 420, height: 720 },
  earnings: { title: "Upcoming Earnings", width: 420, height: 640 },
};

export function isPopoutPanelId(value: string): value is PopoutPanelId {
  return value in POPOUT_PANELS;
}

const EARNINGS_STORAGE_KEY = "trustticker:earnings:v1";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStoredEarnings(): EarningsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EARNINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EarningsEvent[];
    const today = todayYmd();
    return parsed.filter((e) => e.date >= today);
  } catch {
    return [];
  }
}

function storeEarnings(events: EarningsEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EARNINGS_STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* ignore */
  }
}

function mergeEarningsList(
  prev: EarningsEvent[],
  incoming: EarningsEvent[]
): EarningsEvent[] {
  const map = new Map(prev.map((e) => [e.symbol, e] as const));
  for (const e of incoming) map.set(e.symbol, e);
  const today = todayYmd();
  const next = [...map.values()]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20);
  storeEarnings(next);
  return next;
}

export function MarketMonitor({
  className,
  solo,
  initialSnapshot = null,
}: {
  className?: string;
  /** Render a single panel full-bleed (legacy /popout route). */
  solo?: PopoutPanelId;
  initialSnapshot?: MarketScannerSnapshot | null;
}) {
  const [snapshot, setSnapshot] = useState<MarketScannerSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(!initialSnapshot);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [expandedPanel, setExpandedPanel] = useState<PopoutPanelId | null>(null);
  const earningsCursorRef = useRef(0);
  const fetchedEarningsRef = useRef<Set<string>>(new Set());
  const liveQuotes = useLiveQuotes();
  const isPopout = Boolean(solo);

  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedPanel]);

  const monitorSymbols = [
    ...(snapshot?.volumeLeaders?.map((l) => l.symbol) ?? []),
    ...(snapshot?.alerts?.map((a) => a.symbol) ?? []),
    ...MARKET_STATE_SYMBOLS,
  ];
  useRegisterLiveSymbols(solo ? `market-monitor-${solo}` : "market-monitor", monitorSymbols);

  useEffect(() => {
    const stored = loadStoredEarnings();
    if (stored.length > 0) {
      setEarnings(stored);
      for (const e of stored) fetchedEarningsRef.current.add(e.symbol);
    }
    const t = setTimeout(() => {
      void fetch("/api/earnings?sticky=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.events) && d.events.length > 0) {
            setEarnings((prev) => mergeEarningsList(prev, d.events as EarningsEvent[]));
            for (const e of d.events as EarningsEvent[]) {
              fetchedEarningsRef.current.add(e.symbol);
            }
          }
        })
        .catch(() => {});
    }, 2_000);
    return () => clearTimeout(t);
  }, []);

  const fetchScanner = useCallback(async () => {
    try {
      const res = await fetch("/api/scanner");
      if (!res.ok) return;
      const data: MarketScannerSnapshot = await res.json();
      setSnapshot(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // SSR seed paints immediately — delay first refetch so /api/scanner isn't
    // competing with news SSE on open.
    const seeded = Boolean(initialSnapshot);
    let kickoff: ReturnType<typeof setTimeout> | null = null;
    if (seeded) {
      kickoff = setTimeout(() => void fetchScanner(), 3_000);
    } else {
      void fetchScanner();
    }
    const interval = setInterval(fetchScanner, isPopout ? 12_000 : 25_000);
    return () => {
      if (kickoff) clearTimeout(kickoff);
      clearInterval(interval);
    };
  }, [fetchScanner, isPopout, initialSnapshot]);

  const fetchEarnings = useCallback(async () => {
    const syms = [
      ...(snapshot?.volumeLeaders?.map((l) => l.symbol) ?? []),
      ...(snapshot?.alerts?.map((a) => a.symbol) ?? []),
    ];
    const unique = [...new Set(syms)].filter(Boolean);
    if (unique.length === 0) return;

    const start = earningsCursorRef.current % unique.length;
    const batch: string[] = [];
    const max = Math.min(8, unique.length);
    for (let i = 0; i < max; i++) {
      batch.push(unique[(start + i) % unique.length]);
    }
    earningsCursorRef.current = (start + batch.length) % unique.length;

    const needFetch = batch.filter((s) => !fetchedEarningsRef.current.has(s));
    if (needFetch.length === 0) return;

    try {
      const res = await fetch(
        `/api/earnings?symbols=${needFetch.join(",")}&max=${needFetch.length}&sticky=1`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.events)) return;

      for (const sym of needFetch) fetchedEarningsRef.current.add(sym);
      setEarnings((prev) => mergeEarningsList(prev, data.events as EarningsEvent[]));
    } catch {
      /* ignore */
    }
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    void fetchEarnings();
    const interval = setInterval(fetchEarnings, 10 * 60_000);
    return () => clearInterval(interval);
  }, [snapshot, fetchEarnings]);

  const session = snapshot?.marketSession ?? "closed";
  const expandControls = !isPopout
    ? {
        onExpand: (id: PopoutPanelId) => setExpandedPanel(id),
        onMinimize: () => setExpandedPanel(null),
      }
    : undefined;

  if (solo === "wire-alerts") {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <AlertFeed
          alerts={snapshot?.alerts ?? []}
          loading={loading}
          session={session}
          liveQuotes={liveQuotes}
          expanded
        />
      </div>
    );
  }
  if (solo === "volume") {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <VolumePanel
          leaders={snapshot?.volumeLeaders ?? []}
          loading={loading}
          session={session}
          liveQuotes={liveQuotes}
          expanded
        />
      </div>
    );
  }
  if (solo === "market-state") {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <MarketStatePanel quotes={liveQuotes} loading={loading} expanded />
      </div>
    );
  }
  if (solo === "earnings") {
    return (
      <div className={cn("h-full min-h-0", className)}>
        <EarningsPanel events={earnings} loading={loading && earnings.length === 0} expanded />
      </div>
    );
  }

  const expandedNode =
    expandedPanel === "wire-alerts" ? (
      <AlertFeed
        alerts={snapshot?.alerts ?? []}
        loading={loading}
        session={session}
        liveQuotes={liveQuotes}
        expanded
        {...expandControls}
        activePanel="wire-alerts"
      />
    ) : expandedPanel === "volume" ? (
      <VolumePanel
        leaders={snapshot?.volumeLeaders ?? []}
        loading={loading}
        session={session}
        liveQuotes={liveQuotes}
        expanded
        {...expandControls}
        activePanel="volume"
      />
    ) : expandedPanel === "market-state" ? (
      <MarketStatePanel
        quotes={liveQuotes}
        loading={loading}
        expanded
        {...expandControls}
        activePanel="market-state"
      />
    ) : expandedPanel === "earnings" ? (
      <EarningsPanel
        events={earnings}
        loading={loading && earnings.length === 0}
        expanded
        {...expandControls}
        activePanel="earnings"
      />
    ) : null;

  return (
    <div className={cn("relative flex flex-col gap-2 h-full min-h-0", className)}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-[1.7] min-h-[260px] lg:min-h-0">
        <AlertFeed
          alerts={snapshot?.alerts ?? []}
          loading={loading}
          session={session}
          liveQuotes={liveQuotes}
          {...expandControls}
          activePanel="wire-alerts"
        />
        <VolumePanel
          leaders={snapshot?.volumeLeaders ?? []}
          loading={loading}
          session={session}
          liveQuotes={liveQuotes}
          {...expandControls}
          activePanel="volume"
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-[0.9] min-h-0 max-h-44 lg:max-h-48 shrink-0">
        <MarketStatePanel
          quotes={liveQuotes}
          loading={loading}
          {...expandControls}
          activePanel="market-state"
        />
        <EarningsPanel
          events={earnings}
          loading={loading && earnings.length === 0}
          {...expandControls}
          activePanel="earnings"
        />
      </div>

      {expandedNode && (
        <div className="absolute inset-0 z-30 flex flex-col rounded-lg border border-emerald-500/30 bg-zinc-950 shadow-2xl shadow-black/50 overflow-hidden">
          <div className="absolute inset-0 bg-zinc-950/40 pointer-events-none" aria-hidden />
          <div className="relative flex-1 min-h-0 p-1.5 sm:p-2">{expandedNode}</div>
        </div>
      )}
    </div>
  );
}

type PanelExpandProps = {
  activePanel?: PopoutPanelId;
  onExpand?: (id: PopoutPanelId) => void;
  onMinimize?: () => void;
  expanded?: boolean;
};

function PanelShell({
  title,
  icon: Icon,
  badge,
  children,
  className,
  activePanel,
  onExpand,
  onMinimize,
  expanded,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children: React.ReactNode;
  className?: string;
} & PanelExpandProps) {
  const canToggle = Boolean(activePanel && (onExpand || onMinimize));

  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-950/60 overflow-hidden flex flex-col min-h-0 h-full",
        expanded && "rounded-md border-zinc-700 bg-zinc-950",
        className
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="w-3 h-3 text-emerald-500 shrink-0" />
          <span className="text-[10px] font-semibold text-zinc-200 uppercase tracking-wide truncate">
            {title}
          </span>
          {badge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium shrink-0">
              {badge}
            </span>
          )}
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => {
              if (expanded) onMinimize?.();
              else if (activePanel) onExpand?.(activePanel);
            }}
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors"
            title={expanded ? `Minimize ${title}` : `Expand ${title}`}
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            <span className="hidden sm:inline">{expanded ? "Minimize" : "Expand"}</span>
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function AlertFeed({
  alerts,
  loading,
  session,
  liveQuotes,
  expanded,
  activePanel,
  onExpand,
  onMinimize,
}: {
  alerts: MarketAlert[];
  loading: boolean;
  session: MarketScannerSnapshot["marketSession"];
  liveQuotes: Record<string, LiveQuote>;
} & PanelExpandProps) {
  return (
    <PanelShell
      title="Wire Alerts"
      icon={Radio}
      badge={SESSION_LABELS[session]}
      expanded={expanded}
      activePanel={activePanel}
      onExpand={onExpand}
      onMinimize={onMinimize}
    >
      <div className="h-full overflow-y-auto">
        {loading && alerts.length === 0 ? (
          <div className="p-2 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-900/50 animate-pulse rounded" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-[10px] text-zinc-600 p-3 text-center">
            Watching for HOD, retests &amp; volume…
          </p>
        ) : (
          <ul>
            {alerts.map((alert) => {
              const change =
                pickLiveField(alert.symbol, liveQuotes, "changePercent", alert.changePercent) ?? 0;
              return (
                <li
                  key={alert.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 border-b border-zinc-800/50 hover:bg-zinc-900/40 text-[11px]",
                    expanded && "py-1.5 text-[12px]"
                  )}
                >
                  <span className="text-[9px] text-zinc-600 font-mono shrink-0 w-11">
                    {formatClock(alert.timestamp)}
                  </span>
                  <AlertIcon type={alert.type} />
                  <div className="min-w-0 flex-1 truncate">
                    <a
                      href={tradingViewUrl(alert.symbol)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-white mr-1 hover:text-emerald-400"
                    >
                      {alert.symbol}
                    </a>
                    <span className="text-zinc-500">{alert.message}</span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] font-semibold shrink-0",
                      change >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(change)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}

function VolumePanel({
  leaders,
  loading,
  session,
  liveQuotes,
  expanded,
  activePanel,
  onExpand,
  onMinimize,
}: {
  leaders: VolumeLeader[];
  loading: boolean;
  session: MarketScannerSnapshot["marketSession"];
  liveQuotes: Record<string, LiveQuote>;
} & PanelExpandProps) {
  return (
    <PanelShell
      title="Heavy Volume"
      icon={BarChart3}
      badge={`${leaders.length} stocks`}
      expanded={expanded}
      activePanel={activePanel}
      onExpand={onExpand}
      onMinimize={onMinimize}
    >
      <div className="hidden sm:grid grid-cols-[64px_52px_44px_1fr_40px] gap-1.5 px-2 py-1 border-b border-zinc-800/80 text-[9px] uppercase tracking-wider text-zinc-500 shrink-0">
        <span>Ticker</span>
        <span className="text-center">Chg</span>
        <span className="text-center">RVol</span>
        <span>Today / Avg</span>
        <span className="text-right">·</span>
      </div>
      <div className="h-full overflow-y-auto">
        {loading && leaders.length === 0 ? (
          <div className="p-2 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-900/50 animate-pulse rounded" />
            ))}
          </div>
        ) : leaders.length === 0 ? (
          <p className="text-[10px] text-zinc-600 p-3 text-center">
            Scanning volume — {SESSION_LABELS[session].toLowerCase()}
          </p>
        ) : (
          leaders.map((leader, i) => (
            <VolumeRow
              key={`${leader.symbol}-${i}`}
              leader={leader}
              liveQuotes={liveQuotes}
              expanded={expanded}
            />
          ))
        )}
      </div>
    </PanelShell>
  );
}

function VolumeRow({
  leader,
  liveQuotes,
  expanded,
}: {
  leader: VolumeLeader;
  liveQuotes: Record<string, LiveQuote>;
  expanded?: boolean;
}) {
  const price = pickLiveField(leader.symbol, liveQuotes, "price", leader.price) ?? leader.price;
  const change =
    pickLiveField(leader.symbol, liveQuotes, "changePercent", leader.changePercent) ?? 0;
  const rVol =
    pickLiveField(leader.symbol, liveQuotes, "rVol", leader.rVol) ?? leader.rVol ?? 0;
  const hot = rVol >= 5;
  const warm = rVol >= 3;

  return (
    <div
      className={cn(
        "grid grid-cols-[64px_52px_44px_1fr_40px] gap-1.5 items-center px-2 py-1 border-b border-zinc-800/40 hover:bg-zinc-900/40 text-[11px]",
        expanded && "py-1.5 text-[12px]"
      )}
    >
      <div>
        <a
          href={tradingViewUrl(leader.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-bold text-white hover:text-emerald-400 transition-colors"
        >
          {leader.symbol}
        </a>
        <div className="text-[9px] text-zinc-600">{formatPrice(price)}</div>
      </div>
      <span
        className={cn(
          "font-mono text-center font-semibold text-[10px]",
          change >= 0 ? "text-emerald-400" : "text-red-400"
        )}
      >
        {formatPercent(change)}
      </span>
      <span
        className={cn(
          "font-mono text-center font-bold text-[10px]",
          hot ? "text-amber-400" : warm ? "text-orange-400" : "text-zinc-300"
        )}
      >
        {rVol > 0 ? `${rVol.toFixed(1)}×` : "—"}
      </span>
      <span className="text-zinc-400 font-mono text-[10px] truncate">
        {leader.volume > 0 ? formatVol(leader.volume) : "—"}
        <span className="text-zinc-600">
          {" "}
          / {leader.avgVolume > 0 ? formatVol(leader.avgVolume) : "—"}
        </span>
      </span>
      <div className="flex justify-end gap-0.5">
        {leader.nearHod && (
          <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-400">HOD</span>
        )}
        {hot && <Flame className="w-3 h-3 text-amber-400" />}
      </div>
    </div>
  );
}

function EarningsPanel({
  events,
  loading,
  expanded,
  activePanel,
  onExpand,
  onMinimize,
}: {
  events: EarningsEvent[];
  loading: boolean;
} & PanelExpandProps) {
  return (
    <PanelShell
      title="Upcoming Earnings"
      icon={CalendarDays}
      badge={events.length ? `${events.length} soon` : undefined}
      expanded={expanded}
      activePanel={activePanel}
      onExpand={onExpand}
      onMinimize={onMinimize}
    >
      <div className="h-full overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="p-2 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-900/50 animate-pulse rounded" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-[10px] text-zinc-600 p-3 text-center">Loading earnings…</p>
        ) : (
          <ul>
            {(expanded ? events : events.slice(0, 12)).map((e) => (
              <li
                key={`${e.symbol}-${e.date}`}
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-1 border-b border-zinc-800/50 hover:bg-zinc-900/40 text-[11px]",
                  expanded && "py-1.5 text-[12px]"
                )}
              >
                <a
                  href={tradingViewUrl(e.symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-bold text-white hover:text-emerald-400 transition-colors"
                  title="Open chart"
                >
                  {e.symbol}
                </a>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                  {e.date.slice(5)}
                  {e.hour ? ` ${e.hour}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}

function MarketStatePanel({
  quotes,
  loading,
  expanded,
  activePanel,
  onExpand,
  onMinimize,
}: {
  quotes: Record<string, { price: number; changePercent: number }>;
  loading: boolean;
} & PanelExpandProps) {
  const row = (sym: string, label?: string) => {
    const q = quotes[sym];
    return (
      <div
        key={sym}
        className={cn(
          "flex items-center justify-between gap-2 px-2 py-1 border-b border-zinc-800/50 text-[11px]",
          expanded && "py-1.5 text-[12px]"
        )}
      >
        <span className="font-mono font-bold text-white">{label ?? sym}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
            {q ? formatPrice(q.price) : loading ? "…" : "—"}
          </span>
          <span
            className={cn(
              "font-mono text-[10px] font-semibold tabular-nums",
              (q?.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            {q ? formatPercent(q.changePercent) : loading ? "…" : "—"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <PanelShell
      title="Market State"
      icon={Gauge}
      badge={quotes.VIX ? `VIX ${formatPercent(quotes.VIX.changePercent)}` : undefined}
      expanded={expanded}
      activePanel={activePanel}
      onExpand={onExpand}
      onMinimize={onMinimize}
    >
      <div className="h-full overflow-y-auto">
        {row("VIX", "VIX")}
        <div className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
          Indices
        </div>
        {row("SPY")}
        {row("QQQ")}
        {row("IWM")}
        {row("DIA")}
        <div className="px-2 pt-1 pb-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
          Sectors
        </div>
        {row("XLK")}
        {row("XLF")}
        {row("XLE")}
        {row("XLV")}
        {row("XLI")}
        {row("XLY")}
        {row("XLP")}
        {row("XLC")}
        {row("XLU")}
        {row("XLB")}
      </div>
    </PanelShell>
  );
}

function AlertIcon({ type }: { type: MarketAlert["type"] }) {
  const cls = "w-3 h-3 shrink-0";
  switch (type) {
    case "hod":
      return <TrendingUp className={cn(cls, "text-emerald-400")} />;
    case "near_hod":
      return <Target className={cn(cls, "text-cyan-400")} />;
    case "hod_retest":
      return <Activity className={cn(cls, "text-violet-400")} />;
    case "volume_surge":
      return <BarChart3 className={cn(cls, "text-amber-400")} />;
    case "milestone_15m":
      return <Zap className={cn(cls, "text-yellow-400")} />;
    default:
      return <Flame className={cn(cls, "text-orange-400")} />;
  }
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatVol(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}
