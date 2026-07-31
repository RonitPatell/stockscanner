"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Interactive replay of real recent catches from /api/public-stats.
 * Never invents tickers — renders empty state until measured data arrives.
 */

export interface WireWin {
  id: string;
  symbol: string;
  headline: string;
  publishedAt: string;
  ingestedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
}

interface PublicStats {
  recentWins?: WireWin[];
  latency?: {
    avgSec: number | null;
    under3mRate?: number | null;
    sampleSize: number;
  };
  feed?: { itemCount: number; status: string };
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "America/New_York",
    });
  } catch {
    return "—";
  }
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtDelay(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${(sec / 60).toFixed(1)}m`;
}

export function HeroProductStage({ initialWins = [] }: { initialWins?: WireWin[] }) {
  const [wins, setWins] = useState<WireWin[]>(initialWins);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (initialWins.length > 0) return;
    void fetch("/api/public-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicStats | null) => {
        if (d?.recentWins?.length) setWins(d.recentWins.slice(0, 5));
      })
      .catch(() => {});
  }, [initialWins.length]);

  useEffect(() => {
    if (wins.length < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), 3600);
    return () => clearInterval(id);
  }, [wins.length]);

  const activeIdx = wins.length ? tick % wins.length : 0;

  if (wins.length === 0) {
    return (
      <div className="wire-plane wire-plane-fade relative w-full border-t border-[var(--border-medium)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <p className="mk-tick !text-[var(--text-tertiary)]">
            Live catch tape loads when measured catalysts are available —{" "}
            <Link href="/wins" className="!text-emerald-400 hover:underline">
              audit speed wins
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="wire-plane wire-plane-fade relative w-full select-none"
      role="region"
      aria-label="Recent verified catalyst catches"
    >
      <div className="mk-glow-plane absolute inset-0 pointer-events-none" aria-hidden />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-4 py-3.5">
          <span className="mk-tick inline-flex items-center gap-1.5 !text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            Recent verified catches
          </span>
          <span className="mk-tick hidden sm:inline">Publish → ingest measured</span>
          <Link
            href="/wins"
            className="mk-tick ml-auto !text-[var(--text-secondary)] hover:!text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
          >
            Full audit →
          </Link>
        </div>

        <div
          className="grid grid-cols-[56px_56px_1fr_64px] sm:grid-cols-[84px_76px_1fr_84px_72px] gap-2 sm:gap-3 px-1 pb-2 border-b border-[var(--border-medium)]"
          aria-hidden
        >
          <span className="mk-tick">Time</span>
          <span className="mk-tick">Sym</span>
          <span className="mk-tick">Catalyst</span>
          <span className="mk-tick text-right hidden sm:inline">Move</span>
          <span className="mk-tick text-right">Delay</span>
        </div>

        <div>
          {wins.map((row, i) => {
            const isActive = i === activeIdx;
            const up = (row.changePercent ?? 0) >= 0;
            return (
              <div
                key={row.id}
                className={cn(
                  "relative grid grid-cols-[56px_56px_1fr_64px] sm:grid-cols-[84px_76px_1fr_84px_72px] items-center gap-2 sm:gap-3 px-1 py-3 sm:py-3.5 border-b border-[var(--hairline)] transition-colors duration-500",
                  isActive ? "bg-emerald-500/[0.05]" : "bg-transparent"
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[10px] sm:text-[11px] tabular-nums transition-colors",
                    isActive ? "text-emerald-400/90" : "text-[var(--text-muted)]"
                  )}
                >
                  {fmtTime(row.ingestedAt)}
                </span>
                <span className="font-mono font-bold text-sm text-[var(--text-primary)] tracking-tight">
                  {row.symbol}
                </span>
                <span
                  className={cn(
                    "text-xs sm:text-[13px] truncate",
                    isActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                  )}
                >
                  {row.headline}
                </span>
                <span
                  className={cn(
                    "font-mono text-xs text-right tabular-nums hidden sm:block",
                    row.changePercent == null
                      ? "text-[var(--text-muted)]"
                      : up
                        ? "text-emerald-400"
                        : "text-red-400"
                  )}
                >
                  {fmtPct(row.changePercent)}
                </span>
                <span className="font-mono text-[10px] sm:text-xs text-right text-[var(--text-tertiary)] tabular-nums">
                  {fmtDelay(row.ingestDelaySec)}
                </span>

                {isActive && (
                  <span className="absolute left-0 right-0 bottom-0 h-px overflow-hidden" aria-hidden>
                    <span
                      key={tick}
                      className="wire-progress block h-full bg-gradient-to-r from-emerald-500/80 to-emerald-400/30"
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Real proof rail beside the CTA ─────────────────────── */

export function HeroProofRail({
  initial,
}: {
  initial?: {
    avgSec: number | null;
    p50Sec?: number | null;
    under3mRate: number | null;
    under30sRate?: number | null;
    sampleSize: number;
    feedCount: number;
    fastestSec?: number | null;
  } | null;
}) {
  const [stats, setStats] = useState(initial ?? null);

  useEffect(() => {
    if (initial) return;
    void fetch("/api/public-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PublicStats | null) => {
        if (!d?.latency) return;
        const lat = d.latency as {
          avgSec: number | null;
          p50Sec?: number | null;
          under3mRate?: number | null;
          under30sRate?: number | null;
          sampleSize: number;
        };
        setStats({
          avgSec: lat.p50Sec ?? lat.avgSec,
          p50Sec: lat.p50Sec ?? lat.avgSec,
          under3mRate: lat.under30sRate ?? lat.under3mRate ?? null,
          under30sRate: lat.under30sRate ?? null,
          sampleSize: lat.sampleSize,
          feedCount: d.feed?.itemCount ?? 0,
          fastestSec: null,
        });
      })
      .catch(() => {});
  }, [initial]);

  if (!stats || stats.sampleSize <= 0) return null;

  function fmtSec(sec: number) {
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 120) return `${Math.round(sec)}s`;
    return `${(sec / 60).toFixed(1)}m`;
  }

  const deskSec = (stats as { p50Sec?: number | null }).p50Sec ?? stats.avgSec;
  const under30 =
    (stats as { under30sRate?: number | null }).under30sRate ??
    stats.under3mRate;

  const rows: { label: string; value: string }[] = [];
  if (deskSec != null) rows.push({ label: "Desk speed (p50)", value: fmtSec(deskSec) });
  if (under30 != null && under30 > 0)
    rows.push({ label: "Under 30s", value: `${under30}%` });
  if (stats.sampleSize) rows.push({ label: "Wire sample (24h)", value: String(stats.sampleSize) });
  if (stats.feedCount) rows.push({ label: "In feed now", value: String(stats.feedCount) });
  if (rows.length === 0) return null;

  return (
    <aside
      className="landing-fade-up landing-delay-4 border-l border-[var(--border-medium)] pl-6"
      aria-label="Measured desk speed"
    >
      <p className="mk-tick mb-4 !text-emerald-400 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
        Desk speed (last 24h)
      </p>
      <dl className="space-y-4">
        {rows.slice(0, 4).map((r) => (
          <div key={r.label}>
            <dd className="mk-stat text-2xl text-[var(--text-primary)]">{r.value}</dd>
            <dt className="mk-tick mt-1">{r.label}</dt>
          </div>
        ))}
      </dl>
      <Link
        href="/wins"
        className="mk-tick !text-[var(--text-secondary)] hover:!text-emerald-400 transition-colors mt-5 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
      >
        Audit every catch →
      </Link>
    </aside>
  );
}
