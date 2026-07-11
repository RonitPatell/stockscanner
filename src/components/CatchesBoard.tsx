"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface CatchRow {
  id: string;
  symbol: string;
  headline: string;
  ingestDelaySec: number;
  changePercent: number | null;
  source: string;
}

interface Caller {
  name: string;
  count: number;
}

export function CatchesBoard({ className }: { className?: string }) {
  const [catches, setCatches] = useState<CatchRow[]>([]);
  const [callers, setCallers] = useState<Caller[]>([]);

  useEffect(() => {
    void fetch("/api/catches?limit=8&hours=72")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.catches) setCatches(d.catches);
        if (d?.topCallers) setCallers(d.topCallers);
      })
      .catch(() => {});
  }, []);

  if (catches.length === 0 && callers.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3",
          className
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-semibold text-emerald-200">Catches board</span>
        </div>
        <p className="text-[10px] text-zinc-600">
          Speed catches and top callers appear here as the wire fills.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-500/15 bg-emerald-500/10">
        <Trophy className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[11px] font-semibold text-emerald-200">Catches board</span>
        <Link href="/wins" className="ml-auto text-[9px] text-emerald-500 hover:underline">
          Full proof →
        </Link>
      </div>
      <div className="divide-y divide-emerald-500/10 max-h-48 overflow-y-auto">
        {catches.map((c) => (
          <div key={c.id} className="px-3 py-1.5 text-[11px] flex items-center gap-2">
            <span className="font-mono font-bold text-white w-12">{c.symbol}</span>
            <span className="text-zinc-500 font-mono text-[10px] w-10">{c.ingestDelaySec}s</span>
            {c.changePercent != null && (
              <span
                className={cn(
                  "font-mono text-[10px] w-14",
                  c.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {formatPercent(c.changePercent)}
              </span>
            )}
            <span className="text-zinc-500 truncate flex-1">{c.headline}</span>
          </div>
        ))}
      </div>
      {callers.length > 0 && (
        <div className="px-3 py-2 border-t border-emerald-500/15 flex flex-wrap gap-2">
          <span className="text-[9px] text-zinc-600 uppercase tracking-wide w-full">
            Top callers
          </span>
          {callers.map((c) => (
            <span
              key={c.name}
              className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400"
            >
              {c.name} · {c.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
