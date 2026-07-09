"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronRight, X } from "lucide-react";
import type { PlaybookStats } from "@/lib/playbooks";
import { Button } from "./ui/button";
import { cn, formatPercent } from "@/lib/utils";

export function CatalystPlaybookPanel({
  catalystType,
  floatShares,
  className,
}: {
  catalystType?: string | null;
  floatShares?: number | null;
  className?: string;
}) {
  const [playbook, setPlaybook] = useState<PlaybookStats | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ type: catalystType || "other" });
    if (floatShares != null) params.set("float", String(floatShares));
    void fetch(`/api/playbooks?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPlaybook(d))
      .catch(() => {});
  }, [catalystType, floatShares]);

  if (!playbook) return null;

  return (
    <div className={cn("rounded-md border border-violet-500/20 bg-violet-500/5 p-2.5", className)}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-violet-300 mb-2">
        <BookOpen className="w-3 h-3" />
        Catalyst Playbook
        {playbook.source === "live" && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
            live data
          </span>
        )}
      </div>
      <p className="text-[10px] text-zinc-400 mb-2">{playbook.label}</p>
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {[
          { k: "30m avg", v: formatPercent(playbook.avgMove30m) },
          { k: "1d avg", v: formatPercent(playbook.avgMove1d) },
          { k: "Gap rate", v: `${Math.round(playbook.gapRate * 100)}%` },
          { k: "Win rate", v: `${Math.round(playbook.winRate * 100)}%` },
        ].map(({ k, v }) => (
          <div key={k} className="rounded bg-zinc-950/60 px-1.5 py-1 text-center">
            <div className="text-[9px] text-zinc-600">{k}</div>
            <div className="text-[10px] font-mono text-emerald-400">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-zinc-500 leading-relaxed">{playbook.playbook}</p>
      <p className="text-[9px] text-zinc-600 mt-1">n={playbook.sampleSize} observations</p>
    </div>
  );
}
