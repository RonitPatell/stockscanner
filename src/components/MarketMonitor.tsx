"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Flame,
  TrendingUp,
  BarChart3,
  Radio,
  Target,
  Zap,
} from "lucide-react";
import type { MarketAlert, MarketScannerSnapshot, VolumeLeader } from "@/types";
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
    fetchScanner();
    const interval = setInterval(fetchScanner, 25_000);
    return () => clearInterval(interval);
  }, [fetchScanner]);

  const session = snapshot?.marketSession ?? "closed";

  return (
    <div className={cn("grid lg:grid-cols-5 gap-2 h-full min-h-0", className)}>
      <AlertFeed alerts={snapshot?.alerts ?? []} loading={loading} session={session} />
      <VolumePanel leaders={snapshot?.volumeLeaders ?? []} loading={loading} session={session} />
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
    <PanelShell title="Wire Alerts" icon={Radio} badge={SESSION_LABELS[session]} className="lg:col-span-2">
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
      className="lg:col-span-3"
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
