"use client";

import { useEffect, useState } from "react";
import { Newspaper, Radio, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
  status: string;
  feedUpdatedAt: string | null;
  feedItemCount: number;
  avgIngestDelaySec: number | null;
  feedAgeSec: number | null;
  wireCycleMs: number;
  pipelineInFlight: boolean;
  scaleMode: boolean;
  latencyMetric?: string | null;
}

function formatAgo(sec: number | null, iso: string | null): string {
  let s = sec;
  if (s == null && iso) {
    s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  }
  if (s == null || !Number.isFinite(s)) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/**
 * Plain-language desk health for the top bar.
 * Live = headlines flowing · Catching up = older than 3m · Offline = empty.
 */
export function TrustStatusBar({ className }: { className?: string }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const load = () => {
      void fetch("/api/health")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setHealth(d))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!health) {
    return (
      <div
        className={cn(
          "desk-health flex items-center gap-2 min-w-0 text-[11px] text-zinc-500",
          className
        )}
      >
        Connecting…
      </div>
    );
  }

  void tick; // refresh relative ages

  const count = health.feedItemCount ?? 0;
  const ageSec =
    health.feedAgeSec ??
    (health.feedUpdatedAt
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(health.feedUpdatedAt).getTime()) / 1000
          )
        )
      : null);

  const ingesting = health.pipelineInFlight || health.status === "ingesting";
  let statusLabel = "Offline";
  let live = false;
  let warn = false;
  if (ingesting && count > 0) {
    statusLabel = "Updating";
    live = true;
  } else if (count > 0 && ageSec != null && ageSec <= 180) {
    statusLabel = "Live";
    live = true;
  } else if (count > 0) {
    statusLabel = "Catching up";
    warn = true;
  } else if (ingesting) {
    statusLabel = "Starting";
  }

  const scanSec = Math.max(5, Math.round((health.wireCycleMs || 60_000) / 1000));
  const deskP50 = health.avgIngestDelaySec;

  return (
    <div
      className={cn("desk-health flex items-center gap-1.5 min-w-0", className)}
      data-guide="trust-status"
      title="Desk health: live headlines, last update, scan cadence"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border shrink-0",
          live && !warn
            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
            : warn
              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
              : "bg-zinc-900/80 border-zinc-700/60 text-zinc-400"
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            live && !warn
              ? "bg-emerald-400 animate-pulse"
              : warn
                ? "bg-amber-400"
                : "bg-zinc-600"
          )}
        />
        {statusLabel}
      </span>

      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-800 text-[11px] text-zinc-400">
        <Timer className="w-3 h-3" />
        News {formatAgo(ageSec, health.feedUpdatedAt)}
      </span>

      <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-800 text-[11px] text-zinc-400">
        <Radio className="w-3 h-3" />
        Scans ~{scanSec}s
      </span>

      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-zinc-800 text-[11px] text-zinc-300">
        <Newspaper className="w-3 h-3" />
        {count} headlines
      </span>

      {deskP50 != null && (
        <span className="hidden lg:inline-flex px-2 py-1 rounded-full border border-zinc-800 text-[11px] text-zinc-500">
          Desk {deskP50}s
        </span>
      )}
    </div>
  );
}
