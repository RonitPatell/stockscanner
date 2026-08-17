"use client";

/**
 * Watchtower desk — material changes across monitored companies.
 * Review priority only; never buy/sell advice.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type {
  WatchtowerEventDto,
  WatchtowerFeedResult,
} from "@/lib/watchtower/types";
import {
  WATCHTOWER_FEED_FILTERS,
  buildWatchtowerQuery,
  countNewSince,
  countRequiringReview,
  eventIdFromSearchParams,
  formatEventWhen,
  loadWatchtowerLastVisit,
  reasonCodeLabel,
  saveWatchtowerLastVisit,
  significanceBadgeClass,
  significanceDisplay,
  writeWatchtowerDeepLink,
  type WatchtowerFeedFilterId,
} from "@/lib/watchtower/ui";
import { openSafeHttpUrl, safeHttpUrl } from "@/lib/monitor/safe-open";
import { cn } from "@/lib/utils";
import { WatchtowerEventDrawer } from "./WatchtowerEventDrawer";

function useDrawerMode(): "side" | "overlay" | "sheet" {
  const [mode, setMode] = useState<"side" | "overlay" | "sheet">("side");
  useEffect(() => {
    const mqSheet = window.matchMedia("(max-width: 639px)");
    const mqOverlay = window.matchMedia("(max-width: 1023px)");
    const apply = () => {
      if (mqSheet.matches) setMode("sheet");
      else if (mqOverlay.matches) setMode("overlay");
      else setMode("side");
    };
    apply();
    mqSheet.addEventListener("change", apply);
    mqOverlay.addEventListener("change", apply);
    return () => {
      mqSheet.removeEventListener("change", apply);
      mqOverlay.removeEventListener("change", apply);
    };
  }, []);
  return mode;
}

function EventCardSkeleton() {
  return (
    <div
      className="desk-panel desk-panel--flat p-3 sm:p-4 animate-pulse space-y-2"
      aria-hidden
    >
      <div className="flex gap-3">
        <div className="h-4 w-14 rounded bg-zinc-800" />
        <div className="h-4 w-20 rounded bg-zinc-800" />
        <div className="ml-auto h-4 w-16 rounded bg-zinc-800" />
      </div>
      <div className="h-4 w-3/4 rounded bg-zinc-800" />
      <div className="h-3 w-full rounded bg-zinc-800/80" />
      <div className="h-3 w-2/3 rounded bg-zinc-800/60" />
    </div>
  );
}

export function WatchtowerDesk() {
  const titleId = useId();
  const drawerMode = useDrawerMode();
  const [filter, setFilter] = useState<WatchtowerFeedFilterId>("all");
  const [items, setItems] = useState<WatchtowerEventDto[]>([]);
  const [meta, setMeta] = useState<WatchtowerFeedResult["meta"] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);
  const visitSaved = useRef(false);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId]
  );

  const load = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      const append = opts?.append === true;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
        setForbidden(false);
      }
      try {
        const qs = buildWatchtowerQuery(filter, {
          cursor: opts?.cursor,
          limit: 40,
        });
        const res = await fetch(`/api/watchtower?${qs}`);
        const data = (await res.json().catch(() => ({}))) as WatchtowerFeedResult & {
          error?: string;
          code?: string;
        };
        if (res.status === 403) {
          setForbidden(true);
          setError(
            data.error ||
              "TrustTicker access required to view Watchtower."
          );
          if (!append) setItems([]);
          return;
        }
        if (!res.ok) {
          setError(data.error || "Could not load Watchtower feed.");
          return;
        }
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setNextCursor(data.nextCursor ?? null);
        setMeta(data.meta ?? null);
        setFetchedAt(Date.now());
      } catch {
        setError("Network error loading Watchtower.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    setLastVisit(loadWatchtowerLastVisit());
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (loading || visitSaved.current) return;
    if (forbidden || error) return;
    visitSaved.current = true;
    saveWatchtowerLastVisit();
  }, [loading, forbidden, error]);

  // Deep-link: open event from ?eventId=
  useEffect(() => {
    if (loading || items.length === 0) return;
    try {
      const id = eventIdFromSearchParams(
        new URLSearchParams(window.location.search)
      );
      if (!id) return;
      const found = items.find((i) => i.id === id);
      if (found) {
        setSelectedId(found.id);
        setDrawerOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, [loading, items]);

  const openEvent = useCallback((ev: WatchtowerEventDto) => {
    setSelectedId(ev.id);
    setDrawerOpen(true);
    writeWatchtowerDeepLink(ev.id);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    writeWatchtowerDeepLink(null);
  }, []);

  const markRead = useCallback(async () => {
    if (!selected) return;
    setMarkingRead(true);
    try {
      const res = await fetch(`/api/watchtower/events/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not mark as read.");
        return;
      }
      const readState = data.readState as WatchtowerEventDto["readState"];
      setItems((prev) =>
        prev.map((it) =>
          it.id === selected.id ? { ...it, readState } : it
        )
      );
    } catch {
      setError("Network error marking as read.");
    } finally {
      setMarkingRead(false);
    }
  }, [selected]);

  const onCardKeyDown = useCallback(
    (e: React.KeyboardEvent, ev: WatchtowerEventDto, index: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEvent(ev);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = listRef.current?.querySelectorAll<HTMLElement>(
          "[data-watchtower-card]"
        )[index + 1];
        next?.focus();
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = listRef.current?.querySelectorAll<HTMLElement>(
          "[data-watchtower-card]"
        )[index - 1];
        prev?.focus();
      }
    },
    [openEvent]
  );

  const requiringReview = countRequiringReview(items);
  const newSince = countNewSince(items, lastVisit);
  const stale =
    fetchedAt != null && nowTick - fetchedAt > 5 * 60_000;

  const emptyPortfolio =
    !loading &&
    !error &&
    !forbidden &&
    meta != null &&
    meta.monitoredSymbolCount === 0;

  const emptyEvents =
    !loading &&
    !error &&
    !forbidden &&
    meta != null &&
    meta.monitoredSymbolCount > 0 &&
    items.length === 0;

  return (
    <div
      className="flex flex-1 min-h-0 w-full"
      data-guide="watchtower-desk"
      data-testid="watchtower-desk"
      data-desk-mode="watchtower"
    >
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-4 space-y-4">
          <header className="space-y-1 max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              Watchtower
            </p>
            <h2
              id={titleId}
              className="text-[1.35rem] sm:text-2xl font-semibold tracking-tight text-zinc-100"
            >
              Watchtower
            </h2>
            <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
              Material changes across the companies you monitor.
            </p>
          </header>

          {/* Summary */}
          <div
            className="flex flex-wrap gap-2 sm:gap-3"
            data-testid="watchtower-summary"
            aria-label="Watchtower summary"
          >
            <div className="desk-panel desk-panel--flat px-3 py-2 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Requiring review
              </p>
              <p className="text-lg font-semibold text-zinc-100 tabular-nums">
                {loading ? "—" : requiringReview}
              </p>
            </div>
            <div className="desk-panel desk-panel--flat px-3 py-2 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                New since last visit
              </p>
              <p className="text-lg font-semibold text-zinc-100 tabular-nums">
                {loading ? "—" : newSince}
              </p>
            </div>
            <div className="desk-panel desk-panel--flat px-3 py-2 min-w-[8.5rem]">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Thesis conflicts
              </p>
              <p className="text-[13px] text-zinc-500 pt-1">
                Available once thesis monitoring is on
              </p>
            </div>
            <div className="flex items-end gap-2 ml-auto">
              {stale ? (
                <span
                  className="text-[11px] text-amber-400/90 self-center"
                  data-testid="watchtower-stale"
                >
                  Feed may be stale
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => void load()}
                disabled={loading}
                aria-label="Refresh Watchtower feed"
                data-testid="watchtower-refresh"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", loading && "animate-spin")}
                  aria-hidden
                />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div
            role="toolbar"
            aria-label="Watchtower filters"
            className="flex flex-wrap gap-1.5"
            data-testid="watchtower-filters"
          >
            {WATCHTOWER_FEED_FILTERS.map((f) => {
              const on = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="button"
                  aria-pressed={on}
                  data-testid={`watchtower-filter-${f.id}`}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "desk-feed-tab px-2.5 py-1 rounded text-[12px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
                    on
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100/90 space-y-2"
              data-testid="watchtower-error"
            >
              <p>{error}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void load()}
                >
                  Retry
                </Button>
                {forbidden ? (
                  <Link
                    href="/pricing"
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    View pricing
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div
              className="space-y-2"
              aria-busy="true"
              aria-label="Loading Watchtower"
              data-testid="watchtower-loading"
            >
              <EventCardSkeleton />
              <EventCardSkeleton />
              <EventCardSkeleton />
            </div>
          ) : null}

          {emptyPortfolio ? (
            <div
              className="desk-panel border border-dashed border-zinc-700 px-4 py-8 text-center max-w-lg mx-auto"
              data-testid="watchtower-empty-portfolio"
            >
              <p className="text-zinc-100 font-medium">No companies yet</p>
              <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
                Add names in Portfolio so Watchtower can surface material
                changes across what you monitor.
              </p>
              <Link
                href="/dashboard?view=portfolio"
                className={cn(buttonVariants(), "mt-4")}
              >
                Open Portfolio
              </Link>
            </div>
          ) : null}

          {emptyEvents ? (
            <div
              className="desk-panel border border-dashed border-zinc-700 px-4 py-8 text-center max-w-lg mx-auto"
              data-testid="watchtower-empty-events"
            >
              <p className="text-zinc-100 font-medium">No events in this view</p>
              <p className="mt-1.5 text-[13px] text-zinc-400 leading-relaxed">
                Nothing matched the current filter for your monitored companies.
                Try All, or check back after new filings land.
              </p>
            </div>
          ) : null}

          {!loading && items.length > 0 ? (
            <div
              ref={listRef}
              className="space-y-2"
              role="list"
              aria-labelledby={titleId}
              data-testid="watchtower-feed"
            >
              {items.map((ev, index) => {
                const src = safeHttpUrl(ev.source.url);
                const level = ev.significance.level;
                const reasons = ev.significance.reasonCodes.slice(0, 3);
                const unread = !ev.readState.isRead;
                return (
                  <article
                    key={ev.id}
                    role="listitem"
                    data-watchtower-card
                    data-event-id={ev.id}
                    data-testid={`watchtower-card-${ev.id}`}
                    tabIndex={0}
                    aria-label={`${ev.symbol}: ${ev.title}`}
                    onClick={() => openEvent(ev)}
                    onKeyDown={(e) => onCardKeyDown(e, ev, index)}
                    className={cn(
                      "desk-panel desk-panel--flat p-3 sm:p-4 cursor-pointer transition-colors",
                      "hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--background)]",
                      unread ? "border-l-2 border-l-emerald-500/50" : "opacity-90"
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-sm font-semibold text-emerald-300">
                        {ev.symbol}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide",
                          significanceBadgeClass(level)
                        )}
                      >
                        {significanceDisplay(level)}
                      </span>
                      <span className="text-[11px] text-zinc-500 ml-auto tabular-nums">
                        {formatEventWhen(ev.occurredAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] sm:text-sm text-zinc-100 font-medium leading-snug">
                      {ev.title}
                    </p>
                    <p className="mt-1 text-[12px] text-zinc-400 leading-relaxed line-clamp-2">
                      <span className="text-zinc-500 uppercase tracking-wide text-[10px] mr-1.5">
                        What changed
                      </span>
                      {ev.summary?.trim() ||
                        "Disclosure recorded — open for detail."}
                    </p>
                    {reasons.length > 0 ? (
                      <p className="mt-1.5 text-[12px] text-zinc-500 leading-snug">
                        <span className="text-zinc-600 uppercase tracking-wide text-[10px] mr-1.5">
                          Why review
                        </span>
                        {reasons.map(reasonCodeLabel).join(" · ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-600">
                        Source · {ev.source.type}
                      </span>
                      {src ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] text-sky-400/90 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded px-1"
                          data-testid={`watchtower-card-source-${ev.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openSafeHttpUrl(src);
                          }}
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden />
                          View source
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {!loading && nextCursor ? (
            <div className="flex justify-center pt-2 pb-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingMore}
                data-testid="watchtower-load-more"
                onClick={() => void load({ cursor: nextCursor, append: true })}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {drawerOpen && drawerMode === "side" ? (
        <WatchtowerEventDrawer
          event={selected}
          open={drawerOpen}
          onClose={closeDrawer}
          onMarkRead={() => void markRead()}
          markingRead={markingRead}
          mode="side"
        />
      ) : null}

      {drawerOpen && drawerMode !== "side" ? (
        <WatchtowerEventDrawer
          event={selected}
          open={drawerOpen}
          onClose={closeDrawer}
          onMarkRead={() => void markRead()}
          markingRead={markingRead}
          mode={drawerMode}
        />
      ) : null}

      {!drawerOpen ? (
        <WatchtowerEventDrawer
          event={null}
          open={false}
          onClose={() => {}}
          onMarkRead={() => {}}
          mode="side"
        />
      ) : null}
    </div>
  );
}
