"use client";

/**
 * Monitored portfolio desk — add / remove / search companies.
 * Quotes enrich opportunistically; the page works without them.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortfolioItemDto } from "@/lib/portfolio";

type SearchHit = { symbol: string; name: string | null; exchange: string | null };

function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function PortfolioDesk() {
  const formId = useId();
  const [items, setItems] = useState<PortfolioItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PortfolioItemDto | null>(
    null
  );
  const [removing, setRemoving] = useState(false);
  const [filter, setFilter] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio");
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setError(
          data.error ||
            "TrustTicker access required. Start a trial or subscribe to monitor companies."
        );
        setItems([]);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not load portfolio.");
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Network error loading portfolio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/portfolio/search?q=${encodeURIComponent(q)}&limit=10`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.results)) {
          setHits(data.results);
        } else {
          setHits([]);
        }
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  const filtered = filter.trim()
    ? items.filter((it) => {
        const f = filter.trim().toUpperCase();
        return (
          it.symbol.includes(f) ||
          (it.label ?? "").toUpperCase().includes(f) ||
          (it.companyName ?? "").toUpperCase().includes(f) ||
          (it.notes ?? "").toUpperCase().includes(f)
        );
      })
    : items;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const entry =
        entryPrice.trim() === "" ? undefined : Number(entryPrice.trim());
      if (entryPrice.trim() && (!Number.isFinite(entry) || (entry ?? 0) <= 0)) {
        setAddError("Entry price must be a positive number.");
        setAdding(false);
        return;
      }
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.trim(),
          label: label.trim() || null,
          note: note.trim() || null,
          entryPrice: entry ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data.error || "Could not add company.");
        return;
      }
      setSymbol("");
      setLabel("");
      setNote("");
      setEntryPrice("");
      setQuery("");
      setHits([]);
      if (data.item) {
        setItems((prev) => {
          const without = prev.filter((p) => p.id !== data.item.id);
          return [...without, data.item];
        });
      } else {
        await load();
      }
      symbolInputRef.current?.focus();
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/portfolio/${pendingRemove.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not remove company.");
        setPendingRemove(null);
        return;
      }
      setItems((prev) => prev.filter((p) => p.id !== pendingRemove.id));
      setPendingRemove(null);
    } catch {
      setError("Network error removing company.");
      setPendingRemove(null);
    } finally {
      setRemoving(false);
    }
  }

  function pickHit(hit: SearchHit) {
    setSymbol(hit.symbol);
    setQuery(hit.symbol);
    setHits([]);
    symbolInputRef.current?.focus();
  }

  return (
    <section
      className="space-y-4 max-w-3xl"
      aria-labelledby={`${formId}-title`}
    >
      <header className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          Portfolio
        </p>
        <h2
          id={`${formId}-title`}
          className="text-lg font-semibold text-[var(--text-primary)] tracking-tight"
        >
          Monitored companies
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Tell TrustTicker which names matter. Quotes appear when available —
          monitoring works without live prices.
        </p>
      </header>

      <form
        onSubmit={handleAdd}
        className="desk-panel desk-panel--raised p-3 sm:p-4 space-y-3"
        aria-label="Add company to portfolio"
      >
        <div className="relative">
          <label htmlFor={`${formId}-search`} className="sr-only">
            Search company
          </label>
          <div className="flex items-center gap-2 border border-[var(--border)] bg-black/20 px-2.5 rounded-md focus-within:ring-2 focus-within:ring-emerald-500/40">
            <Search className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
            <input
              id={`${formId}-search`}
              ref={symbolInputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSymbol(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && hits[0]) {
                  e.preventDefault();
                  pickHit(hits[0]);
                }
                if (e.key === "Escape") setHits([]);
              }}
              placeholder="Search or type ticker (e.g. AAPL)"
              autoComplete="off"
              className="flex-1 min-w-0 bg-transparent py-2.5 text-sm text-[var(--text-primary)] placeholder:text-zinc-600 outline-none"
              aria-autocomplete="list"
              aria-controls={`${formId}-hits`}
              aria-expanded={hits.length > 0}
            />
            {searching && (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" aria-hidden />
            )}
          </div>
          {hits.length > 0 && (
            <ul
              id={`${formId}-hits`}
              role="listbox"
              className="absolute z-20 mt-1 w-full max-h-56 overflow-auto border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg rounded-md"
            >
              {hits.map((hit) => (
                <li key={hit.symbol} role="option">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none flex items-baseline gap-2"
                    onClick={() => pickHit(hit)}
                  >
                    <span className="font-semibold text-emerald-400">
                      {hit.symbol}
                    </span>
                    <span className="text-zinc-400 truncate">
                      {hit.name ?? "—"}
                    </span>
                    {hit.exchange && (
                      <span className="ml-auto text-[10px] uppercase text-zinc-600">
                        {hit.exchange}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label
              htmlFor={`${formId}-label`}
              className="block text-[11px] text-zinc-500 mb-1"
            >
              Personal label (optional)
            </label>
            <input
              id={`${formId}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="e.g. Core holding"
              className="w-full rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <div>
            <label
              htmlFor={`${formId}-entry`}
              className="block text-[11px] text-zinc-500 mb-1"
            >
              Entry price (optional)
            </label>
            <input
              id={`${formId}-entry`}
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor={`${formId}-note`}
            className="block text-[11px] text-zinc-500 mb-1"
          >
            Note (optional)
          </label>
          <input
            id={`${formId}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Why you are watching this name"
            className="w-full rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        {addError && (
          <p className="text-sm text-red-400" role="alert">
            {addError}
          </p>
        )}

        <Button
          type="submit"
          size="sm"
          disabled={adding || !symbol.trim()}
          className="w-full sm:w-auto"
        >
          {adding ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {adding ? "Adding…" : "Add company"}
        </Button>
      </form>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <p className="text-[12px] text-zinc-500">
          {loading ? "Loading…" : `${items.length} monitored`}
        </p>
        {items.length > 0 && (
          <div className="relative flex-1 sm:max-w-xs">
            <label htmlFor={`${formId}-filter`} className="sr-only">
              Filter portfolio
            </label>
            <input
              id={`${formId}-filter`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter list"
              className="w-full rounded-md border border-[var(--border)] bg-black/20 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
        )}
      </div>

      {loading && (
        <div
          className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center"
          aria-busy="true"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading portfolio…
        </div>
      )}

      {!loading && error && (
        <div
          className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 space-y-2"
          role="alert"
        >
          <p>{error}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
            <Link href="/pricing">
              <Button type="button" size="sm" variant="outline">
                View pricing
              </Button>
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="desk-panel border border-dashed border-[var(--border)] px-4 py-10 text-center space-y-2">
          <p className="text-sm text-[var(--text-primary)] font-medium">
            No companies yet
          </p>
          <p className="text-[13px] text-[var(--text-secondary)] max-w-sm mx-auto">
            Add tickers you own or follow. TrustTicker will use this list for
            Watchtower and company monitoring — no broker login required.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="space-y-2" aria-label="Monitored companies">
          {filtered.map((item) => {
            const pct = item.quote?.changePercent;
            const pctClass =
              pct == null
                ? "text-zinc-500"
                : pct >= 0
                  ? "text-emerald-400"
                  : "text-red-400";
            return (
              <li
                key={item.id}
                className="desk-panel desk-panel--raised px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Link
                      href={`/ticker/${item.symbol}`}
                      className="font-semibold text-emerald-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                    >
                      {item.symbol}
                    </Link>
                    {item.companyName && (
                      <span className="text-[13px] text-zinc-400 truncate">
                        {item.companyName}
                      </span>
                    )}
                    {item.label && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">
                        {item.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-zinc-500">
                    <span>
                      Monitoring since{" "}
                      {new Date(item.monitoredSince).toLocaleDateString()}
                    </span>
                    {item.entryPrice != null && (
                      <span>Entry {formatPrice(item.entryPrice)}</span>
                    )}
                    {item.quote?.price != null && (
                      <span className={pctClass}>
                        {formatPrice(item.quote.price)}{" "}
                        {formatPct(item.quote.changePercent)}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-[12px] text-zinc-400 truncate">
                      {item.notes}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="shrink-0 self-start sm:self-center text-red-300/90 hover:text-red-200"
                  onClick={() => setPendingRemove(item)}
                  aria-label={`Remove ${item.symbol}`}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-zinc-500 text-center py-6">
          No matches for “{filter}”.
        </p>
      )}

      {pendingRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-remove-title`}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !removing) setPendingRemove(null);
          }}
        >
          <div className="w-full max-w-md desk-panel desk-panel--raised p-4 space-y-3 border border-[var(--border)] bg-[var(--bg-elevated)]">
            <div className="flex items-start justify-between gap-2">
              <h3
                id={`${formId}-remove-title`}
                className="text-base font-semibold text-[var(--text-primary)]"
              >
                Remove {pendingRemove.symbol}?
              </h3>
              <button
                type="button"
                className="p-1 text-zinc-500 hover:text-zinc-300"
                onClick={() => !removing && setPendingRemove(null)}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Stop monitoring this company. You can add it again later. This
              does not connect to any broker.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={removing}
                onClick={() => setPendingRemove(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removing}
                onClick={() => void confirmRemove()}
              >
                {removing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                {removing ? "Removing…" : "Remove company"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
