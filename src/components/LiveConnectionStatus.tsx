"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface LivePayload {
  label: string;
  feed: string;
  browserStream: string;
  alertDelivery: string;
  sampleSizes: {
    feed: number;
    browserStream: number;
    alertDelivery: number;
  };
}

/** User-visible live connection status (feed + stream + alerts). */
export function LiveConnectionStatus({ className }: { className?: string }) {
  const [live, setLive] = useState<LivePayload | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/status?hours=24")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.live) setLive(d.live);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!live) return null;

  const bad =
    live.feed === "outage" ||
    live.browserStream === "outage" ||
    live.alertDelivery === "outage";
  const warn =
    live.feed === "degraded" ||
    live.browserStream === "degraded" ||
    live.alertDelivery === "degraded";

  return (
    <div
      className={cn(
        "rounded border px-2 py-1 text-[10px]",
        bad
          ? "border-red-500/40 text-red-300"
          : warn
            ? "border-amber-500/40 text-amber-300"
            : "border-emerald-500/30 text-emerald-300/90",
        className
      )}
      data-guide="live-connection-status"
      title={`Feed n=${live.sampleSizes.feed}; stream n=${live.sampleSizes.browserStream}; alerts n=${live.sampleSizes.alertDelivery}`}
    >
      {live.label}
    </div>
  );
}
