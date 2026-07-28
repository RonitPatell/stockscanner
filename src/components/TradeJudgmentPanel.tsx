"use client";

import { useMemo } from "react";
import type { CatalystItem } from "@/types";
import { buildTradeJudgment } from "@/lib/trade-judgment";
import { presentJudgment } from "@/lib/judgment/present";
import { cn } from "@/lib/utils";
import { HelpTip } from "./HelpTip";
import { JudgmentV2Panel } from "./JudgmentV2Panel";
import { JudgmentDimensionsView } from "./judgment/JudgmentDimensionsStrip";

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
  const presented = useMemo(
    () =>
      presentJudgment({
        judgment: j.judgmentV2 ?? null,
        catalystStrength: j.judgmentV2?.catalystStrength,
        directionalImplication: j.judgmentV2?.directionalImplication,
        legacyGrade: j.grade,
        dilutionHint: j.checklist.some(
          (c) => c.id === "not-dilution" && !c.pass
        ),
      }),
    [j]
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-700/80 bg-zinc-950/50 px-3 py-3 space-y-3",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Judgment dimensions
            </span>
            <HelpTip title="Not a buy or sell label">
              {presented.separationNote} Legacy desk grades (GO / WATCH / SKIP)
              remain in the database for compatibility but are not shown as the
              primary label.
            </HelpTip>
            <span className="ml-auto text-[11px] font-mono opacity-70">
              {j.confidence}% confidence
            </span>
          </div>
          <JudgmentDimensionsView
            presentation={presented}
            compact
            showHelp={false}
          />
          <p className="text-[12px] mt-1.5 leading-snug text-zinc-300">
            {j.nextStep}
          </p>
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
                <span className="opacity-50">·</span>
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
                  <span className="opacity-50">·</span>
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
            Filters protect capital. A failed box means pause and verify — especially
            dilution and already-extended moves. Not a personalized recommendation.
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
          {onTake && presented.materiality === "High" && (
            <button
              type="button"
              onClick={onTake}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/15"
            >
              Log as reviewed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact badge for the feed row — materiality + direction, never GO/LONG/SHORT. */
export function TradeGradeBadge({
  catalyst,
  className,
}: {
  catalyst: CatalystItem;
  className?: string;
}) {
  const j = useMemo(() => buildTradeJudgment(catalyst), [catalyst]);
  const presented = useMemo(
    () =>
      presentJudgment({
        judgment: j.judgmentV2 ?? null,
        legacyGrade: j.grade,
      }),
    [j]
  );
  const dirTone =
    presented.direction === "Positive"
      ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
      : presented.direction === "Negative"
        ? "border-red-500/40 text-red-300 bg-red-500/10"
        : presented.direction === "Mixed"
          ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
          : "border-zinc-600 text-zinc-300 bg-zinc-800/40";

  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center text-[9px] font-semibold px-1 py-0.5 rounded-md border leading-tight text-center min-w-[2.75rem]",
        dirTone,
        className
      )}
      title={presented.dimensionsLine}
      aria-label={presented.ariaLabel}
    >
      <span className="tracking-wide">{presented.direction.slice(0, 3)}</span>
      <span className="opacity-80 font-normal">{presented.materiality}</span>
    </span>
  );
}
