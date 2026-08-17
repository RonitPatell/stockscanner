"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import { cn } from "@/lib/utils";
import {
  significanceBadgeClass,
  significanceDisplay,
} from "@/lib/watchtower/ui";
import {
  loadTickerLastView,
  saveTickerLastView,
} from "@/lib/ticker-what-changed/last-view";
import type {
  CompanyWhatChangedCard,
  CompanyWhatChangedFeed,
  WhatChangedWindow,
} from "@/lib/ticker-what-changed/types";
import { WHAT_CHANGED_WINDOWS } from "@/lib/ticker-what-changed/types";

const WINDOW_LABELS: Record<WhatChangedWindow, string> = {
  since_last_view: "Since last view",
  "7d": "7D",
  "30d": "30D",
  quarter: "Quarter",
  "1y": "1Y",
};

function CardRow({
  card,
  entitled,
}: {
  card: CompanyWhatChangedCard;
  entitled: boolean;
}) {
  return (
    <article
      className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3"
      data-testid="what-changed-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            What happened
          </p>
          <h3 className="text-sm font-medium text-zinc-100 leading-snug">
            {card.whatHappened}
          </h3>
        </div>
        <span
          className={cn(
            "shrink-0 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border",
            significanceBadgeClass(card.significance.level)
          )}
        >
          {significanceDisplay(card.significance.level)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
            When
          </dt>
          <dd className="text-zinc-300">
            <time dateTime={card.when}>{card.whenLabel}</time>
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
            Category
          </dt>
          <dd className="text-zinc-300 capitalize">{card.category}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
            What changed
          </dt>
          <dd className="text-zinc-400 leading-relaxed mt-0.5">
            {card.whatChanged}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
            Source
          </dt>
          <dd className="mt-0.5">
            {card.source.url ? (
              <SafeExternalLink
                href={card.source.url}
                className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                fallback="null"
              >
                Open source <ExternalLink className="w-3 h-3" />
              </SafeExternalLink>
            ) : (
              <span className="text-zinc-500">{card.source.type}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">
            Thesis relevance
          </dt>
          <dd className="text-zinc-400 mt-0.5">
            {!entitled ? (
              <span className="text-zinc-600">
                Requires plan —{" "}
                <Link href="/pricing" className="text-emerald-400 hover:underline">
                  unlock
                </Link>
              </span>
            ) : card.thesisRelevance == null ? (
              <span className="text-zinc-600">—</span>
            ) : card.thesisRelevance.status === "none" ? (
              <span className="text-zinc-500">Not tied to thesis</span>
            ) : (
              <span className="text-sky-200/90">
                {card.thesisRelevance.summary}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function WhatChangedFeedClient({
  symbol,
  initialFeed,
  entitled,
}: {
  symbol: string;
  initialFeed: CompanyWhatChangedFeed;
  entitled: boolean;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [windowId, setWindowId] = useState<WhatChangedWindow>(
    initialFeed.meta.window === "since_last_view" ||
      WHAT_CHANGED_WINDOWS.includes(initialFeed.meta.window)
      ? initialFeed.meta.window
      : "30d"
  );
  const [showAll, setShowAll] = useState(initialFeed.meta.showAllActivity);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Defer saving so "Since last view" can still read the prior visit.
    const t = window.setTimeout(() => saveTickerLastView(symbol), 2500);
    return () => window.clearTimeout(t);
  }, [symbol]);

  const reload = useCallback(
    (nextWindow: WhatChangedWindow, nextShowAll: boolean) => {
      startTransition(async () => {
        setError(null);
        const sp = new URLSearchParams();
        sp.set("window", nextWindow);
        if (nextShowAll) sp.set("showAll", "1");
        if (nextWindow === "since_last_view") {
          const last = loadTickerLastView(symbol);
          if (last) sp.set("since", last);
        }
        try {
          const res = await fetch(
            `/api/ticker/${encodeURIComponent(symbol)}/what-changed?${sp}`,
            { credentials: "same-origin" }
          );
          if (!res.ok) {
            setError("Could not refresh What Changed.");
            return;
          }
          const data = (await res.json()) as { feed?: CompanyWhatChangedFeed };
          if (data.feed) setFeed(data.feed);
        } catch {
          setError("Could not refresh What Changed.");
        }
      });
    },
    [symbol]
  );

  return (
    <div
      className="space-y-5"
      data-testid="ticker-what-changed"
      data-guide="ticker-what-changed"
    >
      <header className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">What Changed</h2>
          <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed max-w-prose">
            Company events, financial deltas, capital risk, insider and
            ownership activity, and filing section changes. Review priority
            only — not buy/sell advice.
            {!entitled ? (
              <>
                {" "}
                Public preview is limited;{" "}
                <Link
                  href="/pricing"
                  className="text-emerald-400 hover:underline"
                >
                  subscribe
                </Link>{" "}
                for personalized monitoring and thesis relevance.
              </>
            ) : null}
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="what-changed-windows"
        >
          {WHAT_CHANGED_WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setWindowId(w);
                reload(w, showAll);
              }}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded border transition-colors",
                windowId === w
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              )}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-[12px] text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-900"
            checked={showAll}
            onChange={(e) => {
              const v = e.target.checked;
              setShowAll(v);
              reload(windowId, v);
            }}
            data-testid="what-changed-show-all"
          />
          Show all activity
          {feed.meta.routineHiddenCount > 0 && !showAll ? (
            <span className="text-zinc-600">
              ({feed.meta.routineHiddenCount} routine hidden)
            </span>
          ) : null}
        </label>

        {feed.meta.usedFallbackWindow ? (
          <p className="text-[11px] text-zinc-500">
            No prior view saved — showing last 30 days.
          </p>
        ) : null}
        {pending ? (
          <p className="text-[11px] text-zinc-500">Updating…</p>
        ) : null}
        {error ? (
          <p className="text-[12px] text-rose-300">{error}</p>
        ) : null}
      </header>

      {feed.empty ? (
        <div
          className="rounded-xl border border-dashed border-zinc-700 px-4 py-10 text-center"
          data-testid="what-changed-empty"
        >
          <p className="text-[13px] text-zinc-400 leading-relaxed max-w-md mx-auto">
            {feed.emptyMessage}
          </p>
          {!showAll && feed.meta.routineHiddenCount > 0 ? (
            <button
              type="button"
              className="mt-4 text-[12px] text-emerald-400 hover:underline"
              onClick={() => {
                setShowAll(true);
                reload(windowId, true);
              }}
            >
              Show all activity
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {feed.cards.map((card) => (
            <li key={card.id}>
              <CardRow card={card} entitled={entitled} />
            </li>
          ))}
        </ul>
      )}

      {feed.meta.previewCapped && feed.meta.accessMode === "public" ? (
        <p className="text-[12px] text-zinc-500 text-center">
          Preview capped.{" "}
          <Link href="/pricing" className="text-emerald-400 hover:underline">
            Unlock full What Changed
          </Link>
        </p>
      ) : null}
    </div>
  );
}
