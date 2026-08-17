"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Research desk — ticker hub entry for any investor style.
 * Deep research lives on /ticker/[symbol] (filings, Form 4, dilution).
 */
export function ResearchDesk({
  seedSymbols = [],
}: {
  seedSymbols?: string[];
}) {
  const [q, setQ] = useState("");
  const symbol = q.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);

  return (
    <section
      data-guide="research-desk"
      data-testid="research-desk"
      className="max-w-2xl space-y-6"
    >
      <header>
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-1">
          Research
        </p>
        <h2 className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-zinc-100">
          Primary-source ticker hub
        </h2>
        <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
          Open any US symbol for catalysts, SEC filing links, insider Form 4
          context, and dilution flags. Informational only.
        </p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (symbol.length >= 1) {
            window.location.assign(`/ticker/${encodeURIComponent(symbol)}`);
          }
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            maxLength={5}
            className="w-full h-10 pl-9 pr-3 rounded-md border border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
            data-testid="research-ticker-input"
            aria-label="Research ticker"
          />
        </div>
        <Button type="submit" disabled={symbol.length < 1}>
          Open
        </Button>
      </form>

      {seedSymbols.length > 0 ? (
        <div>
          <p className="text-[11px] text-zinc-500 mb-2">From your portfolio</p>
          <div className="flex flex-wrap gap-2">
            {seedSymbols.slice(0, 24).map((s) => (
              <Link
                key={s}
                href={`/ticker/${encodeURIComponent(s)}`}
                className="font-mono text-[12px] px-2.5 py-1 rounded border border-zinc-800 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-zinc-500">
          Add symbols in Portfolio to research them quickly here.
        </p>
      )}
    </section>
  );
}
