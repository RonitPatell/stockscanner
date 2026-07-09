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
} from "lucide-react";
import type { EarningsEvent, MarketAlert, MarketScannerSnapshot, VolumeLeader } from "@/types";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import { tradingViewUrl } from "@/lib/chart-links";

const SESSION_LABELS = {
  premarket: "Pre-Market",
  regular: "Regular",
  afterhours: "After Hours",
  closed: "Closed",
} as const;

export function MarketMonitor({ className }: { className?: string }) {
  const [snapshot, setSnapshot] = useState<MarketScannerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [marketState, setMarketState] = useState<Record<string, { price: number; changePercent: number }>>({});
  const earningsCursorRef = useRef(0);

  const fetchScanner = useCallback(async () => {
    try {
      const res = await fetch("/api/scanner");
      if (!res.ok) return;
      const data: MarketScannerSnapshot = await res.json();
      setSnapshot(data);
    } catch { /* ignore */ }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => {
      fetchScanner();
      interval = setInterval(fetchScanner, 25_000);
    }, 500);
    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
  }, [fetchScanner]);

  const fetchEarnings = useCallback(async () => {
    const syms = [
      ...(snapshot?.volumeLeaders?.map((l) => l.symbol) ?? []),
      ...(snapshot?.alerts?.map((a) => a.symbol) ?? []),
    ];
    const unique = [...new Set(syms)].filter(Boolean);
    if (unique.length === 0) return;

    // rotate through the list to stay under Finnhub limits
    const start = earningsCursorRef.current % unique.length;
    const batch: string[] = [];
    const max = Math.min(8, unique.length);
    for (let i = 0; i < max; i++) {
      batch.push(unique[(start + i) % unique.length]);
    }
    earningsCursorRef.current = (start + batch.length) % unique.length;

    try {
      const res = await fetch(`/api/earnings?symbols=${batch.join(",")}&max=${max}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.events)) return;

      // merge by symbol
      setEarnings((prev) => {
        const map = new Map(prev.map((e) => [e.symbol, e] as const));
        for (const e of data.events as EarningsEvent[]) map.set(e.symbol, e);
        return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
      });
    } catch {
      /* ignore */
    }
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    void fetchEarnings();
    const interval = setInterval(fetchEarnings, 2 * 60_000);
    return () => clearInterval(interval);
  }, [snapshot, fetchEarnings]);

  const fetchMarketState = useCallback(async () => {
    try {
      const res = await fetch("/api/market-state");
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.quotes || typeof data.quotes !== "object") return;
      const out: Record<string, { price: number; changePercent: number }> = {};
      for (const [sym, q] of Object.entries<any>(data.quotes)) {
        if (!q) continue;
        if (typeof q.price !== "number" || typeof q.changePercent !== "number") continue;
        out[sym] = { price: q.price, changePercent: q.changePercent };
      }
      setMarketState(out);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const delay = setTimeout(() => {
      void fetchMarketState();
      interval = setInterval(fetchMarketState, 30_000);
    }, 800);
    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
  }, [fetchMarketState]);

  const session = snapshot?.marketSession ?? "closed";

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-2 h-full min-h-0", className)}>
      <AlertFeed alerts={snapshot?.alerts ?? []} loading={loading} session={session} />
      <VolumePanel leaders={snapshot?.volumeLeaders ?? []} loading={loading} session={session} />
      <MarketStatePanel quotes={marketState} loading={loading} />
      <EarningsPanel events={earnings} loading={loading} />
    </div>
  );
}

function PanelShell({
  title,
  icon: Icon,
  badge,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-950/60 overflow-hidden flex flex-col min-h-0 h-full",
        className
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-semibold text-zinc-200 uppercase tracking-wide">{title}</span>
        </div>
        {badge && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
            {badge}
          </span>
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
}: {
  alerts: MarketAlert[];
  loading: boolean;
  session: MarketScannerSnapshot["marketSession"];
}) {
  return (
    <PanelShell
      title="Wire Alerts"
      icon={Radio}
      badge={SESSION_LABELS[session]}
      className=""
    >
      <div className="h-full overflow-y-auto">
        {loading && alerts.length === 0 ? (
          <div className="p-2 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-900/50 animate-pulse rounded" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <p className="text-[10px] text-zinc-600 p-3 text-center">Watching for HOD, retests &amp; volume…</p>
        ) : (
          <ul>
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center gap-1.5 px-2 py-1 border-b border-zinc-800/50 hover:bg-zinc-900/40 text-[11px]"
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
                    alert.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {formatPercent(alert.changePercent)}
                </span>
              </li>
            ))}
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
}: {
  leaders: VolumeLeader[];
  loading: boolean;
  session: MarketScannerSnapshot["marketSession"];
}) {
  return (
    <PanelShell
      title="Heavy Volume"
      icon={BarChart3}
      badge={`${leaders.length} stocks`}
      className=""
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
            <VolumeRow key={`${leader.symbol}-${i}`} leader={leader} />
          ))
        )}
      </div>
    </PanelShell>
  );
}

function VolumeRow({ leader }: { leader: VolumeLeader }) {
  const hot = leader.rVol >= 5;
  const warm = leader.rVol >= 3;

  return (
    <div className="grid grid-cols-[64px_52px_44px_1fr_40px] gap-1.5 items-center px-2 py-1 border-b border-zinc-800/40 hover:bg-zinc-900/40 text-[11px]">
      <div>
        <a
          href={tradingViewUrl(leader.symbol)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono font-bold text-white hover:text-emerald-400 transition-colors"
        >
          {leader.symbol}
        </a>
        <div className="text-[9px] text-zinc-600">{formatPrice(leader.price)}</div>
      </div>
      <span
        className={cn(
          "font-mono text-center font-semibold text-[10px]",
          leader.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
        )}
      >
        {formatPercent(leader.changePercent)}
      </span>
      <span
        className={cn(
          "font-mono text-center font-bold text-[10px]",
          hot ? "text-amber-400" : warm ? "text-orange-400" : "text-zinc-300"
        )}
      >
        {leader.rVol.toFixed(1)}×
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
}: {
  events: EarningsEvent[];
  loading: boolean;
}) {
  return (
    <PanelShell
      title="Upcoming Earnings"
      icon={CalendarDays}
      badge={events.length ? `${events.length} soon` : undefined}
      className=""
    >
      <div className="h-full overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="p-2 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-6 bg-zinc-900/50 animate-pulse rounded" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-[10px] text-zinc-600 p-3 text-center">
            Loading earnings…
          </p>
        ) : (
          <ul>
            {events.slice(0, 12).map((e) => (
              <li
                key={`${e.symbol}-${e.date}`}
                className="flex items-center justify-between gap-2 px-2 py-1 border-b border-zinc-800/50 hover:bg-zinc-900/40 text-[11px]"
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
}: {
  quotes: Record<string, { price: number; changePercent: number }>;
  loading: boolean;
}) {
  const row = (sym: string, label?: string) => {
    const q = quotes[sym];
    return (
      <div
        key={sym}
        className="flex items-center justify-between gap-2 px-2 py-1 border-b border-zinc-800/50 text-[11px]"
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
      className=""
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
