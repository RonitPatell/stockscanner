"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface DetailPayload {
  label: string;
  feed: string;
  browserStream: string;
  alertDelivery: string;
  sampleSizes: {
    feed: number;
    browserStream: number;
    alertDelivery: number;
  };
  publicLatency?: {
    available: boolean;
    sampleSize: number;
    processing?: { p50Ms: number | null; p90Ms: number | null };
    note?: string;
  };
  productionVerified?: boolean;
}

/**
 * Compact connection status: "● Live · Last event 36s ago"
 * Details in a popover. Never claims latency targets achieved without verification.
 */
export function ConnectionStatusCompact({
  lastEventAt,
  className,
}: {
  lastEventAt: Date | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ago, setAgo] = useState("—");
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    const tick = () => {
      if (!lastEventAt) {
        setAgo("—");
        return;
      }
      const sec = Math.max(
        0,
        Math.floor((Date.now() - lastEventAt.getTime()) / 1000)
      );
      if (sec < 60) setAgo(`${sec}s ago`);
      else if (sec < 3600) setAgo(`${Math.floor(sec / 60)}m ago`);
      else setAgo(`${Math.floor(sec / 3600)}h ago`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lastEventAt]);

  useEffect(() => {
    const load = () => {
      void fetch("/api/status?hours=24")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setDetail({
            label: d.live?.label ?? "Status unknown",
            feed: d.live?.feed ?? "insufficient_data",
            browserStream: d.live?.browserStream ?? "insufficient_data",
            alertDelivery: d.live?.alertDelivery ?? "insufficient_data",
            sampleSizes: d.live?.sampleSizes ?? {
              feed: 0,
              browserStream: 0,
              alertDelivery: 0,
            },
            publicLatency: d.publicLatency,
            productionVerified: Boolean(
              d.indicators?.every?.(
                (i: { achieved?: boolean }) => i.achieved !== true
              ) === false
                ? undefined
                : false
            ),
          });
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const disrupted =
    detail?.feed === "outage" ||
    detail?.browserStream === "outage" ||
    detail?.alertDelivery === "outage";
  const degraded =
    detail?.feed === "degraded" ||
    detail?.browserStream === "degraded" ||
    detail?.alertDelivery === "degraded";

  const liveLabel = disrupted ? "Down" : degraded ? "Degraded" : "Live";
  const dot = disrupted
    ? "bg-red-400"
    : degraded
      ? "bg-amber-400"
      : "bg-emerald-400";

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        data-guide="connection-status"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
          disrupted
            ? "border-red-500/40 text-red-300"
            : degraded
              ? "border-amber-500/40 text-amber-200"
              : "border-emerald-500/30 text-emerald-300/90 hover:bg-emerald-500/10"
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        <span>
          {liveLabel} · Last event {ago}
        </span>
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Connection details"
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-xl text-[11px] text-zinc-300"
        >
          <p className="font-semibold text-zinc-100 mb-2">
            {detail?.label ?? "Loading connection details…"}
          </p>
          <ul className="space-y-1">
            <li>
              Feed: {detail?.feed?.replace(/_/g, " ") ?? "—"} (n=
              {detail?.sampleSizes.feed ?? 0})
            </li>
            <li>
              Browser stream:{" "}
              {detail?.browserStream?.replace(/_/g, " ") ?? "—"} (n=
              {detail?.sampleSizes.browserStream ?? 0})
            </li>
            <li>
              Alert delivery:{" "}
              {detail?.alertDelivery?.replace(/_/g, " ") ?? "—"} (n=
              {detail?.sampleSizes.alertDelivery ?? 0})
            </li>
            <li>Last event: {ago}</li>
          </ul>
          {detail?.publicLatency && (
            <div className="mt-2 border-t border-zinc-800 pt-2 space-y-1">
              <p className="text-zinc-400">
                Processing latency (informational)
              </p>
              <p>
                p50/p90:{" "}
                {fmtMs(detail.publicLatency.processing?.p50Ms)} /{" "}
                {fmtMs(detail.publicLatency.processing?.p90Ms)} · n=
                {detail.publicLatency.sampleSize}
              </p>
              <p className="text-[10px] text-zinc-500">
                Targets are never marked achieved without production
                verification and adequate samples.{" "}
                <Link href="/status" className="text-emerald-400/90 underline">
                  Full status
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtMs(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}
