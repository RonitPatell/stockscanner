"use client";

import { useEffect, useState } from "react";
import { ClipboardList, ListX, Target } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface Setup {
  symbol: string;
  headline: string;
  bias: string;
  action: string;
  conviction: number;
  antiFomoScore: number;
  changePercent: number | null;
  directionLabel?: string;
  reviewLabel?: string;
  materialityLabel?: string;
  tradeabilityLabel?: string;
  topRiskLabel?: string | null;
}

interface Skip {
  symbol: string;
  headline: string;
  reason: string;
  antiFomoScore: number;
  directionLabel?: string;
  reviewLabel?: string;
  materialityLabel?: string;
  topRiskLabel?: string | null;
}

export function SessionPlanCard({ className }: { className?: string }) {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [skips, setSkips] = useState<Skip[]>([]);
  const [mantra, setMantra] = useState("");

  useEffect(() => {
    void fetch("/api/session-plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSetups(d.setups ?? []);
        setSkips(d.skips ?? []);
        setMantra(d.mantra ?? "");
      })
      .catch(() => {});
  }, []);

  if (setups.length === 0 && skips.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-violet-500/25 bg-violet-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/20 bg-violet-500/10">
        <ClipboardList className="w-3.5 h-3.5 text-violet-300" />
        <span className="text-[11px] font-semibold text-violet-200">Session Plan</span>
        <span className="text-[9px] text-violet-500/80">
          Review candidates · capital caution
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-0 sm:divide-x divide-violet-500/10">
        <div className="p-2 space-y-1.5">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-cyan-300/90 px-1">
            <Target className="w-3 h-3" /> Review candidates
          </div>
          {setups.map((s) => (
            <div key={s.symbol} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5">
              <div className="grid grid-cols-[auto_minmax(52px,1fr)_auto] items-center gap-2 text-[11px] min-w-0">
                <span className="font-mono font-bold text-white shrink-0">{s.symbol}</span>
                <span className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                  <span className="text-[9px] uppercase text-cyan-300 shrink-0">
                    {s.directionLabel ?? s.bias}
                  </span>
                  {s.materialityLabel && (
                    <span className="text-[9px] text-zinc-500 shrink-0">
                      {s.materialityLabel}
                    </span>
                  )}
                  {s.changePercent != null && (
                    <span className="font-mono text-zinc-400 text-[10px] truncate min-w-0">
                      {formatPercent(s.changePercent)}
                    </span>
                  )}
                </span>
                <span className="text-[9px] text-zinc-500 tabular-nums whitespace-nowrap justify-self-end">
                  {s.tradeabilityLabel ??
                    (Number.isFinite(s.conviction) ? `${s.conviction.toFixed(0)}` : "—")}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{s.action}</p>
              {s.topRiskLabel && (
                <p className="text-[9px] text-amber-300/90 mt-0.5">Risk: {s.topRiskLabel}</p>
              )}
            </div>
          ))}
        </div>
        <div className="p-2 space-y-1.5 border-t sm:border-t-0 border-violet-500/10">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-amber-400/90 px-1">
            <ListX className="w-3 h-3" /> Capital caution
          </div>
          {skips.map((s) => (
            <div key={s.symbol} className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-bold text-white">{s.symbol}</span>
                <span className="text-[9px] text-amber-400">
                  {s.materialityLabel ?? "Caution"}
                </span>
                {s.topRiskLabel && (
                  <span className="text-[9px] text-amber-300/80 truncate">{s.topRiskLabel}</span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5 leading-snug">{s.reason}</p>
            </div>
          ))}
        </div>
      </div>
      {mantra && (
        <p className="px-3 py-1.5 text-[9px] text-violet-400/70 border-t border-violet-500/10 italic">
          {mantra}
        </p>
      )}
    </div>
  );
}
