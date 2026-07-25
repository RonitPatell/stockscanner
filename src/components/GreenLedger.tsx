"use client";

import { useEffect, useState } from "react";
import { BookOpen, ShieldCheck } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { applyLiveQuote, useLiveQuotes, useRegisterLiveSymbols } from "./LiveQuoteProvider";
import { HelpTip } from "./HelpTip";

const STORAGE_KEY = "tt-green-ledger-v1";
const SKIP_LEGACY_KEY = "tt-skip-ledger-v1";
const EVENT = "tt-green-ledger";
const NOTIONAL_USD = 1000;

export type LedgerKind = "skipped" | "taken";

export interface GreenLedgerEntry {
  id: string;
  kind: LedgerKind;
  symbol: string;
  headline: string;
  changePercentAt: number;
  at: string;
  why: string;
  grade?: string;
}

interface DilutionItem {
  id?: string;
  symbol: string;
  headline: string;
  changePercent: number | null;
  why: string;
}

function loadEntries(): GreenLedgerEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Migrate old skip ledger once
    const legacy = localStorage.getItem(SKIP_LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as Array<{
        symbol: string;
        headline: string;
        changePercentAtSkip: number;
        skippedAt: string;
        why: string;
      }>;
      if (Array.isArray(old)) {
        const migrated: GreenLedgerEntry[] = old.map((s) => ({
          id: `${s.symbol}-${s.skippedAt}`,
          kind: "skipped" as const,
          symbol: s.symbol,
          headline: s.headline,
          changePercentAt: s.changePercentAtSkip,
          at: s.skippedAt,
          why: s.why,
          grade: "SKIP",
        }));
        persist(migrated);
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function persist(entries: GreenLedgerEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 60)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export function recordGreenLedgerEntry(input: {
  kind: LedgerKind;
  symbol: string;
  headline: string;
  changePercent: number | null | undefined;
  why?: string;
  grade?: string;
}): GreenLedgerEntry | null {
  if (!input.symbol || input.changePercent == null) return null;
  const entry: GreenLedgerEntry = {
    id: `${input.symbol}-${input.kind}-${Date.now()}`,
    kind: input.kind,
    symbol: input.symbol.toUpperCase(),
    headline: input.headline,
    changePercentAt: input.changePercent,
    at: new Date().toISOString(),
    why: input.why ?? "",
    grade: input.grade,
  };
  const prev = loadEntries().filter(
    (e) => !(e.symbol === entry.symbol && e.kind === entry.kind)
  );
  persist([entry, ...prev]);
  return entry;
}

/** Back-compat for DilutionRadar */
export function recordSkipFromDilution(item: DilutionItem) {
  return recordGreenLedgerEntry({
    kind: "skipped",
    symbol: item.symbol,
    headline: item.headline,
    changePercent: item.changePercent,
    why: item.why,
    grade: "SKIP",
  });
}

export function GreenLedger({ className }: { className?: string }) {
  const [entries, setEntries] = useState<GreenLedgerEntry[]>([]);
  const [candidates, setCandidates] = useState<DilutionItem[]>([]);
  const liveQuotes = useLiveQuotes();
  useRegisterLiveSymbols(
    "green-ledger",
    entries.map((e) => e.symbol)
  );

  useEffect(() => {
    setEntries(loadEntries());
    const refresh = () => setEntries(loadEntries());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void fetch("/api/dilution?limit=10&hours=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items && setCandidates(d.items))
      .catch(() => {});
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const skipped = entries.filter((e) => e.kind === "skipped");
  const taken = entries.filter((e) => e.kind === "taken");
  const skippedSet = new Set(skipped.map((s) => s.symbol));
  const actionable = candidates.filter(
    (c) => c.symbol && c.changePercent != null && !skippedSet.has(c.symbol.toUpperCase())
  );
  const pctAvoided = skipped.reduce((n, s) => n + Math.abs(s.changePercentAt), 0);
  const usdAvoided = skipped.reduce(
    (n, s) => n + (Math.abs(s.changePercentAt) / 100) * NOTIONAL_USD,
    0
  );

  if (candidates.length === 0 && entries.length === 0) return null;

  return (
    <div
      className={cn(
        "desk-panel overflow-hidden shrink-0",
        className
      )}
    >
      <div className="desk-panel-header">
        <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
        <span className="desk-label text-emerald-200/90 normal-case tracking-normal">
          Green ledger
        </span>
        <HelpTip title="What is the Green ledger?">
          Track setups you skipped (capital protected) and ones you took. Illustrative % only —
          not brokerage P&amp;L. The goal is fewer bad trades over time.
        </HelpTip>
        {skipped.length > 0 && (
          <span className="ml-auto text-[11px] font-mono text-emerald-400/90">
            skips ~{formatPercent(pctAvoided)} · ~${usdAvoided.toFixed(0)}
          </span>
        )}
      </div>

      <p className="px-4 py-1.5 text-[11px] text-zinc-500 border-b border-[--border]">
        Protect first: log skips on dilution. Log takes only when you actually planned the trade.
      </p>

      {actionable.length > 0 && (
        <div className="max-h-28 overflow-y-auto divide-y divide-[--border] border-b border-[--border]">
          {actionable.map((c) => (
            <div key={c.id ?? c.symbol} className="px-4 py-2 flex items-center gap-2 text-[12px]">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-mono font-bold text-white">{c.symbol}</span>
              <span className="font-mono text-amber-400">{formatPercent(c.changePercent)}</span>
              <span className="text-zinc-500 truncate flex-1">{c.headline}</span>
              <button
                type="button"
                onClick={() => {
                  recordSkipFromDilution(c);
                  setEntries(loadEntries());
                }}
                className="shrink-0 text-[11px] font-semibold text-emerald-300 border border-emerald-500/40 rounded-lg px-2 py-1 hover:bg-emerald-500/10"
              >
                I skipped
              </button>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-zinc-500">
          Nothing logged yet. Skip a dilution spike or log a planned take from a catalyst row.
        </p>
      ) : (
        <div className="max-h-44 overflow-y-auto divide-y divide-[--border]">
          {entries.map((raw) => {
            const live = applyLiveQuote(
              { symbol: raw.symbol, changePercent: raw.changePercentAt },
              liveQuotes
            );
            const chg = live.changePercent ?? raw.changePercentAt;
            return (
              <div key={raw.id} className="px-4 py-2 text-[12px]">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded border",
                      raw.kind === "skipped"
                        ? "border-amber-500/40 text-amber-200"
                        : "border-emerald-500/40 text-emerald-300"
                    )}
                  >
                    {raw.kind === "skipped" ? "SKIPPED" : "TAKEN"}
                  </span>
                  <span className="font-mono font-bold text-white">{raw.symbol}</span>
                  <span className={cn("font-mono", chg >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {formatPercent(chg)}
                  </span>
                  <span className="text-[11px] text-zinc-600 font-mono">
                    @ {formatPercent(raw.changePercentAt)}
                  </span>
                  <span className="text-zinc-500 truncate flex-1">{raw.headline}</span>
                </div>
                {raw.why && <p className="text-[11px] text-zinc-600 mt-0.5">{raw.why}</p>}
              </div>
            );
          })}
          {(taken.length > 0 || skipped.length > 0) && (
            <p className="px-4 py-1.5 text-[10px] text-zinc-600">
              {skipped.length} skipped · {taken.length} taken · illustrative only
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** @deprecated use GreenLedger */
export const SkipSavingsLedger = GreenLedger;
