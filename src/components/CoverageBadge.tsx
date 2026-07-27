"use client";

import { useEffect, useState } from "react";
import { HelpTip } from "./HelpTip";
import { cn } from "@/lib/utils";
import type { CoverageReason } from "@/lib/coverage/types";

const REASON_CLASS: Partial<Record<CoverageReason, string>> = {
  USER_WATCHLIST: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  CURATED_CORE: "border-zinc-500/40 text-zinc-300 bg-zinc-800/60",
  ACTIVE_GAINER: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  UNUSUAL_VOLUME: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  RECENT_HALT: "border-red-500/40 text-red-300 bg-red-500/10",
  FRESH_SEC_FILING: "border-violet-500/40 text-violet-300 bg-violet-500/10",
  FRESH_NEWS: "border-cyan-500/40 text-cyan-300 bg-cyan-500/10",
  MANUAL: "border-zinc-500/40 text-zinc-400 bg-zinc-900",
};

export function CoverageBadge({
  symbol,
  coverageReason,
  matchMethod,
  matchConfidence,
  className,
}: {
  symbol: string;
  coverageReason?: string | null;
  matchMethod?: string | null;
  matchConfidence?: number | null;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(
    coverageReason ? humanReason(coverageReason) : null
  );
  const [hint, setHint] = useState<string>(
    "Why this ticker is in our poll/catalyst universe — not full-market coverage."
  );

  useEffect(() => {
    if (coverageReason) {
      setLabel(humanReason(coverageReason));
      return;
    }
    let cancelled = false;
    void fetch(`/api/coverage?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const primary = d.badges?.[0];
        if (primary) {
          setLabel(primary.label);
          setHint(primary.hint || d.disclaimer);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol, coverageReason]);

  if (!label && matchConfidence == null && !matchMethod) return null;

  const reasonKey = (coverageReason || "") as CoverageReason;
  const badgeClass =
    REASON_CLASS[reasonKey] || "border-zinc-600 text-zinc-400 bg-zinc-800/60";

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
      data-guide="coverage-badge"
    >
      {label && (
        <span
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border uppercase font-semibold tracking-wide",
            badgeClass
          )}
          title={hint}
        >
          {label}
        </span>
      )}
      {(matchMethod || matchConfidence != null) && (
        <span
          className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-400"
          title="Ticker-match confidence from headline/source parsing"
        >
          {matchMethod ? matchMethod.replace(/_/g, " ") : "match"}
          {matchConfidence != null ? ` · ${Math.round(matchConfidence)}` : ""}
        </span>
      )}
      <HelpTip title="Coverage">
        <span className="text-[10px] text-zinc-400 max-w-[14rem]">{hint}</span>
      </HelpTip>
    </span>
  );
}

function humanReason(reason: string): string {
  const map: Record<string, string> = {
    USER_WATCHLIST: "Watchlist",
    CURATED_CORE: "Curated",
    ACTIVE_GAINER: "Gainer",
    UNUSUAL_VOLUME: "Unusual vol",
    RECENT_HALT: "Halt (news)",
    FRESH_SEC_FILING: "SEC filing",
    FRESH_NEWS: "Fresh news",
    MANUAL: "Manual",
  };
  return map[reason] || reason;
}
