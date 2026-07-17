"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { applyLiveQuote, useLiveQuotes, useRegisterLiveSymbols } from "./LiveQuoteProvider";

const STORAGE_KEY = "tt-skip-ledger-v1";
const NOTIONAL_USD = 1000;
const EVENT = "tt-skip-ledger";

export interface SkipEntry {
  symbol: string;
  headline: string;
  changePercentAtSkip: number;
  skippedAt: string;
  why: string;
}

interface DilutionItem {
  id?: string;
  symbol: string;
  headline: string;
  changePercent: number | null;
  why: string;
}

function loadSkips(): SkipEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries: SkipEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

/** Persist a dilution skip from radar, ledger, or elsewhere. */
export function recordSkipFromDilution(item: DilutionItem): SkipEntry | null {
  if (!item.symbol || item.changePercent == null) return null;
  const entry: SkipEntry = {
    symbol: item.symbol.toUpperCase(),
    headline: item.headline,
    changePercentAtSkip: item.changePercent,
    skippedAt: new Date().toISOString(),
    why: item.why ?? "",
  };
  persist([entry, ...loadSkips().filter((s) => s.symbol !== entry.symbol)].slice(0, 40));
  return entry;
}

export function SkipSavingsLedger({ className }: { className?: string }) {
  const [candidates, setCandidates] = useState<DilutionItem[]>([]);
  const [skips, setSkips] = useState<SkipEntry[]>([]);
  const liveQuotes = useLiveQuotes();
  useRegisterLiveSymbols("skip-ledger", skips.map((s) => s.symbol));

  useEffect(() => {
    setSkips(loadSkips());
    const refresh = () => setSkips(loadSkips());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void fetch("/api/dilution?limit=12&hours=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items && setCandidates(d.items))
      .catch(() => {});
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const skipped = new Set(skips.map((s) => s.symbol));
  const actionable = candidates.filter(
    (c) => c.symbol && c.changePercent != null && !skipped.has(c.symbol.toUpperCase())
  );
  const pctAvoided = skips.reduce((n, s) => n + Math.abs(s.changePercentAtSkip), 0);
  const usdAvoided = skips.reduce(
    (n, s) => n + (Math.abs(s.changePercentAtSkip) / 100) * NOTIONAL_USD,
    0
  );

  if (candidates.length === 0 && skips.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-emerald-500/20 bg-emerald-500/10">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[11px] font-semibold text-emerald-200">Skip ledger</span>
        <span className="text-[9px] text-emerald-500/80">dilution spikes you passed</span>
        {skips.length > 0 && (
          <span className="ml-auto text-[9px] font-mono text-emerald-400/90">
            {formatPercent(pctAvoided)} · ~${usdAvoided.toFixed(0)}
          </span>
        )}
      </div>
      {skips.length > 0 && (
        <p className="px-3 py-1 text-[9px] text-emerald-600/90 border-b border-emerald-500/10">
          Illustrative abs-% at skip · $ assumes ${NOTIONAL_USD}/name
        </p>
      )}
      {actionable.length > 0 && (
        <div className="max-h-28 overflow-y-auto divide-y divide-emerald-500/10 border-b border-emerald-500/10">
          {actionable.map((c) => (
            <div key={c.id ?? c.symbol} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
              <span className="font-mono font-bold text-white">{c.symbol}</span>
              <span className="font-mono text-amber-400">{formatPercent(c.changePercent)}</span>
              <span className="text-zinc-600 truncate flex-1">{c.headline}</span>
              <button
                type="button"
                onClick={() => {
                  recordSkipFromDilution(c);
                  setSkips(loadSkips());
                }}
                className="shrink-0 text-[9px] font-semibold uppercase text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 rounded px-1.5 py-0.5"
              >
                I skipped
              </button>
            </div>
          ))}
        </div>
      )}
      {skips.length === 0 ? (
        <p className="px-3 py-2 text-[10px] text-zinc-500">Mark dilution spikes you passed on.</p>
      ) : (
        <div className="max-h-36 overflow-y-auto divide-y divide-emerald-500/10">
          {skips.map((raw) => {
            const live = applyLiveQuote(
              { symbol: raw.symbol, changePercent: raw.changePercentAtSkip },
              liveQuotes
            );
            const chg = live.changePercent ?? raw.changePercentAtSkip;
            return (
              <div key={`${raw.symbol}-${raw.skippedAt}`} className="px-3 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">{raw.symbol}</span>
                  <span className={cn("font-mono", chg >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {formatPercent(chg)}
                  </span>
                  <span className="text-[9px] text-emerald-600/80 font-mono">
                    skipped @ {formatPercent(raw.changePercentAtSkip)}
                  </span>
                  <span className="text-zinc-600 truncate flex-1">{raw.headline}</span>
                </div>
                {raw.why && <p className="text-[9px] text-emerald-600/70 mt-0.5">{raw.why}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
