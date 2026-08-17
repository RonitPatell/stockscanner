import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { TickerHubBundle } from "@/lib/ticker-hub";
import type { QuarterlyDeltaReport } from "@/lib/metrics/quarterly-delta";
import type { TickerWhatChangedEvent } from "@/lib/ticker-what-changed";
import { QuarterlyDeltaCard } from "./QuarterlyDeltaCard";

export function WhatChangedTab({
  hub,
  report,
  events,
}: {
  hub: TickerHubBundle;
  report: QuarterlyDeltaReport;
  events: TickerWhatChangedEvent[];
}) {
  const sym = hub.symbol;

  return (
    <div className="space-y-6" data-testid="ticker-what-changed">
      <QuarterlyDeltaCard report={report} symbol={sym} />

      <section>
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">
          Recent events
        </h2>
        {events.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            No structured company events for {sym} yet. Filings below may still
            appear from the wire.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 mb-1">
                  <span className="uppercase tracking-wide text-zinc-400">
                    {ev.category}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span>{ev.severity}</span>
                  <time className="ml-auto">
                    {ev.occurredAt.toLocaleString()}
                  </time>
                </div>
                <p className="text-sm text-zinc-200">{ev.title}</p>
                {ev.summary ? (
                  <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
                    {ev.summary}
                  </p>
                ) : null}
                {ev.sourceUrl ? (
                  <a
                    href={ev.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-emerald-400 hover:underline"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-testid="ticker-what-changed-filings">
        <h2 className="text-sm font-semibold text-zinc-200 mb-3">
          Filings and catalysts
        </h2>
        {hub.filings.length === 0 && hub.catalysts.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center text-zinc-500 text-[13px]">
            No recent catalysts for {sym} in our feed yet.
            <Link
              href="/pricing"
              className="block mt-3 text-emerald-400 hover:underline"
            >
              See Plus / Pro plans
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(hub.filings.length > 0
              ? hub.filings
              : hub.catalysts.map((c) => ({
                  id: c.id,
                  formHint: "Catalyst",
                  headline: c.headline,
                  publishedAt: c.publishedAt,
                  sourceUrl: c.sourceUrl ?? null,
                }))
            ).map((r) => (
              <article
                key={r.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                    {r.formHint}
                  </span>
                  <time className="text-[10px] text-zinc-500">
                    {r.publishedAt.toLocaleString()}
                  </time>
                </div>
                <h3 className="text-sm font-medium text-zinc-200 mb-2">
                  {r.headline}
                </h3>
                {r.sourceUrl ? (
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    Open source <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
