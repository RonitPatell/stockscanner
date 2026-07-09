"use client";

import { useEffect, useState } from "react";
import { Activity, Clock, Radio, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
  status: string;
  feedUpdatedAt: string | null;
  feedItemCount: number;
  avgIngestDelaySec: number | null;
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

  if (!health) return null;

  const live = health.status === "live" || health.status === "ingesting";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 px-2.5 py-1.5 rounded-lg border text-[10px] shrink-0",
        live
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-zinc-800 bg-zinc-950/60",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            health.pipelineInFlight ? "bg-amber-400 animate-pulse" : live ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
          )}
        />
        {health.pipelineInFlight ? "Ingesting" : live ? "Live feed" : "Starting"}
      </span>
      <span className="inline-flex items-center gap-1 text-zinc-500">
        <Clock className="w-3 h-3" />
        Updated {formatAgo(health.feedUpdatedAt)}
      </span>
      <span className="inline-flex items-center gap-1 text-zinc-500">
        <Zap className="w-3 h-3 text-emerald-500" />
        Wire ~{Math.round(health.wireCycleMs / 1000)}s
      </span>
      {health.avgIngestDelaySec != null && (
        <span className="inline-flex items-center gap-1 text-zinc-500">
          <Radio className="w-3 h-3" />
          Avg ingest {health.avgIngestDelaySec}s after publish
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-zinc-500">
        <Activity className="w-3 h-3" />
        {health.feedItemCount} catalysts
      </span>
      <span className="inline-flex items-center gap-1 text-zinc-600 ml-auto">
        <Shield className="w-3 h-3" />
        {health.scaleMode ? "Scale mode" : "Direct"}
      </span>
    </div>
  );
}
