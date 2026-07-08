"use client";

import { useEffect, useState } from "react";
import { Newspaper, RefreshCw } from "lucide-react";
import type { WatchlistBrief } from "@/types";
import { cn, formatPercent } from "@/lib/utils";
import { setupTagMeta } from "@/lib/setup-tags";

export function WatchlistBriefPanel({ className }: { className?: string }) {
  const [brief, setBrief] = useState<WatchlistBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<"delta" | "morning" | "eod">("delta");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/brief?kind=${kind}`);
      if (res.ok) {
        setBrief(await res.json());
        if (kind === "delta") void fetch("/api/brief", { method: "POST" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [kind]);

  if (loading && !brief) {
    return (
      <div className={cn("rounded-lg border border-zinc-800 bg-zinc-950/50 p-3", className)}>
        <p className="text-[11px] text-zinc-500">Loading watchlist brief…</p>
      </div>
    );
  }

  if (!brief) return null;

  const seen = new Set<string>();
  const displayItems = brief.sections
    .flatMap((s) => s.items)
    .filter((item) => {
      const dedupeKey = `${item.symbol}|${item.publishedAt}|${item.headline.slice(0, 60)}`;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, 6);

  return (
    <div className={cn("rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden", className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/40">
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-emerald-400" />
          <div className="flex gap-1">
            {(["delta", "morning", "eod"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded capitalize",
                  kind === k
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {k === "delta" ? "Since check" : k}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-zinc-500 hover:text-zinc-300"
          title="Refresh brief"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <p className="px-3 py-1.5 text-[10px] text-zinc-500 border-b border-zinc-800/80">
        {brief.summary}
      </p>
      <div className="max-h-36 overflow-y-auto divide-y divide-zinc-800/60">
        {displayItems.map((item) => (
          <div
            key={`${item.symbol}-${item.publishedAt}-${item.headline.slice(0, 40)}`}
            className="px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold text-white">{item.symbol}</span>
              <span
                className={cn(
                  "font-mono text-[10px]",
                  (item.changePercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {formatPercent(item.changePercent)}
              </span>
              {item.setupTags?.slice(0, 2).map((tag) => {
                const meta = setupTagMeta(tag);
                return meta ? (
                  <span key={tag} className="text-[9px] text-amber-400/90">
                    {meta.icon}
                  </span>
                ) : null;
              })}
            </div>
            <p className="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">{item.headline}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export { WatchlistBriefPanel as WatchlistBrief };
