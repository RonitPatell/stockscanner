"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  HelpCircle,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  directionTone,
  materialityTone,
  presentJudgment,
  tradeabilityTone,
  type DirectionLabel,
  type JudgmentPresentation,
  type MaterialityLabel,
  type TradeabilityLabel,
} from "@/lib/judgment/present";
import type { JudgmentV2 } from "@/lib/judgment/types";
import { cn } from "@/lib/utils";
import { HelpTip } from "../HelpTip";

function toneClass(tone: "pos" | "neg" | "warn" | "neutral"): string {
  if (tone === "pos") return "border-emerald-500/40 text-emerald-300";
  if (tone === "neg") return "border-red-500/40 text-red-300";
  if (tone === "warn") return "border-amber-500/40 text-amber-200";
  return "border-zinc-600 text-zinc-300";
}

function DirectionIcon({ direction }: { direction: DirectionLabel }) {
  if (direction === "Positive") {
    return <TrendingUp className="w-3 h-3 shrink-0" aria-hidden />;
  }
  if (direction === "Negative") {
    return <TrendingDown className="w-3 h-3 shrink-0" aria-hidden />;
  }
  if (direction === "Mixed") {
    return <Minus className="w-3 h-3 shrink-0" aria-hidden />;
  }
  return <HelpCircle className="w-3 h-3 shrink-0" aria-hidden />;
}

/**
 * Five-dimension judgment chips — never GO/LONG/SHORT as primary labels.
 */
export function JudgmentDimensionsStrip({
  judgment,
  reactionStage,
  tradeability,
  dilutionHint,
  compact = false,
  className,
  showHelp = true,
}: {
  judgment?: JudgmentV2 | null;
  reactionStage?: string | null;
  tradeability?: string | null;
  dilutionHint?: boolean;
  compact?: boolean;
  className?: string;
  showHelp?: boolean;
}) {
  const p = presentJudgment({
    judgment,
    reactionStage,
    tradeability,
    dilutionHint,
  });
  return (
    <JudgmentDimensionsView
      presentation={p}
      compact={compact}
      className={className}
      showHelp={showHelp}
    />
  );
}

export function JudgmentDimensionsView({
  presentation: p,
  compact = false,
  className,
  showHelp = true,
}: {
  presentation: JudgmentPresentation;
  compact?: boolean;
  className?: string;
  showHelp?: boolean;
}) {
  return (
    <div
      className={cn("space-y-1.5", className)}
      data-judgment-present={p.version}
      aria-label={p.ariaLabel}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <DimChip
          label="Materiality"
          value={p.materiality}
          tone={materialityTone(p.materiality as MaterialityLabel)}
        />
        <DimChip
          label="Direction"
          value={p.direction}
          tone={directionTone(p.direction)}
          icon={<DirectionIcon direction={p.direction} />}
        />
        <DimChip label="Reaction" value={p.reactionStage} />
        <DimChip
          label="Tradeability"
          value={p.tradeability}
          tone={tradeabilityTone(p.tradeability as TradeabilityLabel)}
        />
        {p.topRisk && (
          <DimChip
            label="Risk"
            value={p.topRisk}
            tone="warn"
            icon={<AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />}
          />
        )}
        {showHelp && (
          <HelpTip title="How to read these labels">
            {p.separationNote} Reaction stage describes how far the tape has
            moved relative to the news — not a timing signal to enter. Extremely
            thin tradeability means quotes may be unreliable.
          </HelpTip>
        )}
      </div>
      {!compact && (
        <p className="text-[10px] text-zinc-500 leading-snug">{p.separationNote}</p>
      )}
    </div>
  );
}

function DimChip({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn" | "neutral";
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
        toneClass(tone)
      )}
    >
      {icon}
      <span className="opacity-60">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
