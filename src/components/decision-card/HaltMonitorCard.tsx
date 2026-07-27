"use client";

import { cn } from "@/lib/utils";

export interface HaltCardProps {
  symbol: string;
  active: boolean;
  haltCode: string;
  haltCodeTitle: string;
  lifecycle: string;
  resumptionQuoteLabel: string;
  resumptionTradeLabel: string;
  sessionHaltCount: number | null;
  newsDisseminationStatus: string;
  reconciliationStatus: string;
  catalystCount: number;
  disclaimer: string;
  className?: string;
}

/**
 * Compact Decision Card V3 halt strip.
 * Shows “not yet announced” for missing official resumption times — never estimates.
 */
export function HaltMonitorCard(props: HaltCardProps) {
  if (!props.active && (props.sessionHaltCount == null || props.sessionHaltCount === 0)) {
    return null;
  }

  return (
    <section
      aria-label={`Halt status ${props.symbol}`}
      data-halt-monitor-card
      className={cn(
        "rounded border px-2.5 py-2 text-[11px]",
        props.active
          ? "border-orange-500/45 bg-orange-500/10"
          : "border-[--border] bg-black/20",
        props.className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded border",
              props.active
                ? "border-orange-400/50 text-orange-200"
                : "border-[--border] text-[--text-muted]"
            )}
          >
            {props.active ? "Halt" : "Session"}
          </span>
          <span className="font-mono font-semibold text-[--text-primary] truncate">
            {props.haltCode}
          </span>
          <span className="text-[--text-secondary] truncate">{props.haltCodeTitle}</span>
        </div>
        {props.sessionHaltCount != null && (
          <span className="font-mono text-[10px] text-[--text-muted] shrink-0">
            sess×{props.sessionHaltCount}
          </span>
        )}
      </div>
      {props.active && (
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-[--text-secondary]">
          <div>
            Lifecycle: <span className="text-[--text-primary]">{props.lifecycle}</span>
          </div>
          <div>
            News:{" "}
            <span className="text-[--text-primary]">{props.newsDisseminationStatus}</span>
          </div>
          <div className="col-span-2">
            Quote resume:{" "}
            <span className="text-[--text-primary]">{props.resumptionQuoteLabel}</span>
          </div>
          <div className="col-span-2">
            Trade resume:{" "}
            <span className="text-[--text-primary]">{props.resumptionTradeLabel}</span>
          </div>
          {props.catalystCount > 0 && (
            <div className="col-span-2">
              Headlines/filings during halt: {props.catalystCount}
            </div>
          )}
          {props.reconciliationStatus === "disagreement" ||
          props.reconciliationStatus === "official_preferred" ? (
            <div className="col-span-2 text-amber-200/90">
              Providers disagreed — official exchange preferred
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-1.5 text-[9px] leading-snug text-[--text-muted]">{props.disclaimer}</p>
    </section>
  );
}
