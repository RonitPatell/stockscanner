"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";

interface Call {
  id: string;
  displayName: string;
  symbol: string;
  bias: string;
  headline: string | null;
  note: string | null;
  priceAtCall: number | null;
  changeAtCall: number | null;
  liveChangePercent: number | null;
  createdAt: string;
}

export function CallBoard({
  className,
  watchlistOnly = false,
}: {
  className?: string;
  watchlistOnly?: boolean;
}) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [symbol, setSymbol] = useState("");
  const [bias, setBias] = useState("long");
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    const qs = watchlistOnly
      ? "/api/calls?limit=15&hours=36&watchlist=1"
      : "/api/calls?limit=15&hours=36";
    void fetch(qs)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.calls && setCalls(d.calls))
      .catch(() => {});
  }, [watchlistOnly]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    const onPosted = () => load();
    window.addEventListener("tt-call-posted", onPosted);
    return () => {
      clearInterval(t);
      window.removeEventListener("tt-call-posted", onPosted);
    };
  }, [load]);

  const post = async () => {
    if (!symbol.trim() || posting) return;
    setPosting(true);
    try {
      await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, bias, note }),
      });
      setSymbol("");
      setNote("");
      load();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-orange-500/25 bg-orange-500/5 overflow-hidden shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-orange-500/20 bg-orange-500/10">
        <Megaphone className="w-3.5 h-3.5 text-orange-300" />
        <span className="text-[11px] font-semibold text-orange-200">Call Board</span>
        <span className="text-[9px] text-orange-500/80">prop-style · who called it</span>
      </div>

      <div className="px-2 py-2 flex flex-wrap gap-1.5 border-b border-orange-500/10">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="TICKER"
          maxLength={5}
          className="w-16 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-[11px] font-mono text-white"
        />
        <select
          value={bias}
          onChange={(e) => setBias(e.target.value)}
          className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300"
        >
          <option value="long">long</option>
          <option value="short">short</option>
          <option value="avoid">avoid</option>
          <option value="watch">watch</option>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="optional note"
          className="flex-1 min-w-[100px] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-300"
        />
        <button
          type="button"
          onClick={() => void post()}
          disabled={posting || !symbol.trim()}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-orange-500/40 text-orange-300 hover:bg-orange-500/10 disabled:opacity-40"
        >
          <Plus className="w-3 h-3" /> Call
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto divide-y divide-orange-500/10">
        {calls.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-zinc-600">
            Be first — post a long/short/avoid call on a ticker.
          </p>
        ) : (
          calls.map((c) => (
            <div key={c.id} className="px-3 py-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-[9px] w-14 truncate">{c.displayName}</span>
                <span className="font-mono font-bold text-white">{c.symbol}</span>
                <span
                  className={cn(
                    "text-[9px] uppercase",
                    c.bias === "long"
                      ? "text-emerald-400"
                      : c.bias === "short"
                        ? "text-red-400"
                        : c.bias === "avoid"
                          ? "text-amber-400"
                          : "text-zinc-400"
                  )}
                >
                  {c.bias}
                </span>
                {c.priceAtCall != null && (
                  <span className="font-mono text-zinc-500 text-[10px]">
                    @${c.priceAtCall.toFixed(2)}
                  </span>
                )}
                {c.liveChangePercent != null && (
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      c.liveChangePercent >= 0 ? "text-emerald-400" : "text-red-400"
                    )}
                  >
                    now {formatPercent(c.liveChangePercent)}
                  </span>
                )}
              </div>
              {c.note && <p className="text-[10px] text-zinc-500 pl-14 mt-0.5">{c.note}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** One-tap post from an expanded catalyst card */
export function PostCallButton({
  symbol,
  headline,
  bias = "long",
  className,
}: {
  symbol: string;
  headline?: string;
  bias?: "long" | "short" | "avoid" | "watch";
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (busy || done) return;
    setBusy(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, bias, headline }),
      });
      if (res.ok) {
        setDone(true);
        window.dispatchEvent(new Event("tt-call-posted"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void post()}
      disabled={busy}
      className={cn(
        "text-[10px] px-2 py-1 rounded border border-orange-500/40 text-orange-300 hover:bg-orange-500/10 disabled:opacity-40",
        className
      )}
    >
      {done ? "Called ✓" : `Call ${bias}`}
    </button>
  );
}
