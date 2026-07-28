"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, ExternalLink } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { applyLiveQuote, useLiveQuotes, useRegisterLiveSymbols } from "./LiveQuoteProvider";
import { recordSkipFromDilution } from "./GreenLedger";

interface DilutionItem {
  id: string;
  symbol: string;
  headline: string;
  changePercent: number | null;
  why: string;
  sourceUrl?: string | null;
  capacityNote?: string;
  estimateLabel?: string;
  potentialDilutionPct?: number | null;
  status?: string;
  needsManualReview?: boolean;
  capacityKind?: string;
  instrumentLabel?: string;
}

export function DilutionRadar({ className }: { className?: string }) {
  const [items, setItems] = useState<DilutionItem[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const liveQuotes = useLiveQuotes();
  useRegisterLiveSymbols(
    "dilution-radar",
    items.map((i) => i.symbol)
  );

  useEffect(() => {
    const load = () => {
      void fetch("/api/dilution?limit=8&hours=48")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.items && setItems(d.items))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-amber-500/10">
        <Ban className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-[11px] font-semibold text-amber-200">Dilution Radar</span>
        <span className="text-[9px] text-amber-500/80">SEC evidence · skip spikes</span>
        <span className="ml-auto text-[9px] font-mono text-amber-400/80">{items.length}</span>
      </div>
      <div className="max-h-52 overflow-y-auto divide-y divide-amber-500/10">
        {items.map((raw) => {
          const i = applyLiveQuote(raw, liveQuotes);
          const chg = i.changePercent ?? raw.changePercent;
          const already = skipped.has(raw.symbol.toUpperCase());
          const dilPct =
            raw.potentialDilutionPct != null
              ? `~${raw.potentialDilutionPct}% (${raw.estimateLabel || "estimate"})`
              : raw.estimateLabel
                ? `dilution % ${raw.estimateLabel}`
                : null;
          return (
            <div key={raw.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2 text-[11px]">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                <a
                  href={`?view=feed&cid=${encodeURIComponent(raw.id)}`}
                  data-testid="dilution-open-catalyst"
                  className="font-mono font-bold text-white hover:underline"
                  title={`Open ${raw.symbol} in feed`}
                  onClick={(e) => {
                    // Full navigation so Shell V3 re-reads ?cid= deep-link
                    e.preventDefault();
                    const u = new URL(window.location.href);
                    u.searchParams.set("view", "feed");
                    u.searchParams.set("cid", raw.id);
                    window.location.assign(u.toString());
                  }}
                >
                  {raw.symbol}
                </a>
                {raw.status && (
                  <span className="text-[9px] uppercase tracking-wide text-amber-500/70">
                    {raw.status}
                  </span>
                )}
                {chg != null && (
                  <span
                    className={cn(
                      "font-mono",
                      chg >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    {formatPercent(chg)}
                  </span>
                )}
                <span className="text-zinc-500 truncate flex-1">{raw.headline}</span>
                {raw.sourceUrl && (
                  <a
                    href={raw.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-amber-400/80 hover:text-amber-300"
                    title="Open SEC evidence"
                    data-testid="dilution-filing-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="sr-only">Open SEC evidence for {raw.symbol}</span>
                  </a>
                )}
                <button
                  type="button"
                  disabled={already || chg == null}
                  onClick={() => {
                    if (recordSkipFromDilution(raw)) {
                      setSkipped((prev) => new Set(prev).add(raw.symbol.toUpperCase()));
                    }
                  }}
                  className={cn(
                    "shrink-0 text-[10px] px-2 py-0.5 rounded border transition-colors",
                    already
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-40"
                  )}
                >
                  {already ? "Skipped" : "I skipped"}
                </button>
              </div>
              <p className="text-[9px] text-amber-500/70 pl-5 mt-0.5">{raw.why}</p>
              {(raw.capacityNote || dilPct || raw.needsManualReview) && (
                <p className="text-[9px] text-zinc-500 pl-5 mt-0.5">
                  {[
                    raw.capacityNote,
                    dilPct,
                    raw.needsManualReview ? "Needs manual review" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
