"use client";

import { useMemo } from "react";
import { Ban, Eye, TrendingDown, TrendingUp } from "lucide-react";
import type { CatalystItem } from "@/types";
import {
  actionBiasClass,
  antiFomoClass,
  buildActionPlaybook,
  type ActionBias,
} from "@/lib/action-playbook";
import { cn } from "@/lib/utils";

const ICONS: Record<ActionBias, typeof TrendingUp> = {
  long: TrendingUp,
  short: TrendingDown,
  avoid: Ban,
  watch: Eye,
};

export function ActionPlaybookCard({
  catalyst,
  className,
  compact,
}: {
  catalyst: CatalystItem;
  className?: string;
  compact?: boolean;
}) {
  const playbook = useMemo(() => buildActionPlaybook(catalyst), [catalyst]);
  const Icon = ICONS[playbook.bias];

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2 space-y-1.5",
        actionBiasClass(playbook.bias),
        className
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{playbook.label}</span>
        <span
          className={cn(
            "text-[9px] font-mono px-1.5 py-0.5 rounded border",
            antiFomoClass(playbook.antiFomoScore)
          )}
        >
          FOMO {playbook.antiFomoScore} · {playbook.antiFomoLabel}
        </span>
        <span className="ml-auto text-[9px] font-mono opacity-70">
          {Math.round(playbook.conviction)}% conviction
        </span>
      </div>
      <p className="text-[11px] leading-snug opacity-95">{playbook.action}</p>
      {!compact && (
        <>
          <p className="text-[10px] opacity-70">
            <span className="font-semibold opacity-90">Invalidation: </span>
            {playbook.invalidation}
          </p>
          <p className="text-[10px] opacity-60">{playbook.why}</p>
          <p className="text-[9px] opacity-50 italic">{playbook.risk}</p>
        </>
      )}
    </div>
  );
}
