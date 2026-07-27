"use client";

import { useMemo } from "react";
import { Ban, Check, CircleDot, Eye } from "lucide-react";
import type { CatalystItem } from "@/types";
import {
  buildTradeJudgment,
  gradeClass,
  type TradeGrade,
} from "@/lib/trade-judgment";
import { cn } from "@/lib/utils";
import { HelpTip } from "./HelpTip";
import { JudgmentV2Panel } from "./JudgmentV2Panel";

const ICONS: Record<TradeGrade, typeof Check> = {
  go: Check,
  watch: Eye,
  skip: Ban,
};

export function TradeJudgmentPanel({
  catalyst,
  className,
  onSkip,
  onTake,
}: {
  catalyst: CatalystItem;
  className?: string;
  onSkip?: () => void;
  onTake?: () => void;
}) {
  const j = useMemo(() => buildTradeJudgment(catalyst), [catalyst]);
  const Icon = ICONS[j.grade];

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 space-y-3",
        gradeClass(j.grade),
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold tracking-wide">{j.label}</span>
            <span className="text-[11px] opacity-80">{j.summary}</span>
            <HelpTip title="What does GO / WATCH / SKIP mean?">
              GO = story and how the stock is trading look aligned enough to consider a plan.
              WATCH = wait for confirmation. SKIP = protect capital (dilution, chase, weak setup).
              Not financial advice — a decision aid only.
            </HelpTip>
            <span className="ml-auto text-[11px] font-mono opacity-70">
              {j.confidence}% confidence
            </span>
          </div>
          <p className="text-[12px] mt-1.5 leading-snug opacity-90">{j.nextStep}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/20 border border-white/5 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">
            From the news
          </p>
          <ul className="space-y-1">
            {j.articleReasons.map((r) => (
              <li key={r} className="text-[11px] leading-snug flex gap-1.5">
                <CircleDot className="w-3 h-3 mt-0.5 shrink-0 opacity-50" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-black/20 border border-white/5 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">
            How the company is trading
          </p>
          <ul className="space-y-1">
            {j.performanceReasons.length === 0 ? (
              <li className="text-[11px] opacity-70">No strong tape signal yet</li>
            ) : (
              j.performanceReasons.map((r) => (
                <li key={r} className="text-[11px] leading-snug flex gap-1.5">
                  <CircleDot className="w-3 h-3 mt-0.5 shrink-0 opacity-50" />
                  <span>{r}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">
            Pre-trade checklist
          </p>
          <HelpTip title="Why a checklist?">
            Green trades come from filters. If a box fails, pause — especially dilution and
            already-extended moves.
          </HelpTip>
        </div>
        <ul className="space-y-1">
          {j.checklist.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 text-[11px]"
              title={item.tip}
            >
              <span
                className={cn(
                  "mt-0.5 w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 text-[9px]",
                  item.pass
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                    : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                )}
              >
                {item.pass ? "✓" : "!"}
              </span>
              <span className={cn(!item.pass && "text-amber-100/90")}>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] opacity-60 leading-snug">{j.explanation}</p>

      {j.judgmentVersion && (
        <p className="text-[10px] font-mono text-zinc-500">Classifier {j.judgmentVersion}</p>
      )}

      <JudgmentV2Panel catalyst={catalyst} />

      {(onSkip || onTake) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-100 hover:bg-amber-500/15"
            >
              Log as skipped
            </button>
          )}
          {onTake && j.grade === "go" && (
            <button
              type="button"
              onClick={onTake}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15"
            >
              Log as taken
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact badge for the feed row */
export function TradeGradeBadge({
  catalyst,
  className,
}: {
  catalyst: CatalystItem;
  className?: string;
}) {
  const j = useMemo(() => buildTradeJudgment(catalyst), [catalyst]);
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide",
        gradeClass(j.grade),
        className
      )}
      title={j.summary}
    >
      {j.label}
    </span>
  );
}
