"use client";

import { useEffect, useState } from "react";
import { Clock3, Database, RadioTower } from "lucide-react";
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
}

function formatAgo(iso: string | null): string {
  if (!iso) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export function TrustStatusBar({ className }: { className?: string }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [ago, setAgo] = useState("—");

  useEffect(() => {
    const load = () => {
      void fetch("/api/health")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setHealth(d))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!health?.feedUpdatedAt) return;
    const tick = () => setAgo(formatAgo(health.feedUpdatedAt));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [health?.feedUpdatedAt]);

  if (!health) return null;

  const live = health.status === "live" || health.status === "ingesting";
  const stale = health.status === "stale";
  const statusLabel = health.pipelineInFlight
    ? "Ingesting"
    : stale
      ? "Stale"
      : live
        ? "Live"
        : "Starting";
  const dotColor = health.pipelineInFlight
    ? "bg-amber-400"
    : stale
    ? "bg-red-400"
    : live
    ? "bg-emerald-400"
    : "bg-zinc-600";

  return (
    <div className={cn("desk-health flex items-center gap-2 min-w-0", className)}>
      {/* Live status pill */}
      <span
        className={cn(
          "desk-health-live inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold border shrink-0",
          live
            ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
            : stale
            ? "bg-red-500/10 border-red-500/25 text-red-300"
            : "bg-zinc-900/80 border-zinc-700/60 text-zinc-400"
        )}
      >
        <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor, live && "animate-pulse")} />
        {statusLabel}
      </span>

      {/* Metrics pills */}
      <span className="desk-pill desk-health-detail text-[12px]">
        <Clock3 className="w-3.5 h-3.5" />
        Updated {ago}
      </span>

      <span className="desk-pill desk-health-detail text-[12px]">
        <RadioTower className="w-3.5 h-3.5" />
        Wire cycle ~{Math.round(health.wireCycleMs / 1000)}s
      </span>

      <span className="desk-pill desk-health-count text-[12px]">
        <Database className="w-3.5 h-3.5" />
        {health.feedItemCount} catalysts
      </span>

      {health.avgIngestDelaySec != null && (
        <span className="desk-pill text-[12px] hidden lg:inline-flex">
          Avg ingest {health.avgIngestDelaySec}s
        </span>
      )}
    </div>
  );
}
