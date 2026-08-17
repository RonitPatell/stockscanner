"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SafeExternalLink } from "@/components/SafeExternalLink";
import {
  significanceBadgeClass,
  significanceDisplay,
} from "@/lib/watchtower/ui";
import type {
  PortfolioBriefDto,
  PortfolioBriefItem,
  PortfolioBriefThesisChange,
} from "@/lib/portfolio-brief/types";

function ItemRow({ item }: { item: PortfolioBriefItem }) {
  return (
    <li className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Link
          href={`/ticker/${item.symbol}?tab=what-changed`}
          className="font-mono text-sm font-semibold text-emerald-400 hover:underline"
        >
          {item.symbol}
        </Link>
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {item.category}
        </span>
        <span
          className={cn(
            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
            significanceBadgeClass(item.significanceLevel)
          )}
        >
          {significanceDisplay(item.significanceLevel)}
        </span>
        <time className="ml-auto text-[10px] text-zinc-600">
          {new Date(item.occurredAt).toLocaleString()}
        </time>
      </div>
      <p className="text-[13px] text-zinc-200">{item.title}</p>
      {item.summary ? (
        <p className="text-[12px] text-zinc-500 mt-1 leading-relaxed">
          {item.summary}
        </p>
      ) : null}
      {item.sourceUrl ? (
        <SafeExternalLink
          href={item.sourceUrl}
          className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-emerald-400 hover:underline"
          fallback="null"
        >
          Source <ExternalLink className="w-3 h-3" />
        </SafeExternalLink>
      ) : null}
    </li>
  );
}

function ThesisRow({ row }: { row: PortfolioBriefThesisChange }) {
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2.5",
        row.isConflict
          ? "border-amber-500/35 bg-amber-500/5"
          : "border-zinc-800 bg-zinc-900/40"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Link
          href={`/ticker/${row.symbol}?tab=thesis`}
          className="font-mono text-sm font-semibold text-emerald-400 hover:underline"
        >
          {row.symbol}
        </Link>
        {row.isConflict ? (
          <span className="text-[10px] uppercase tracking-wide text-amber-200 border border-amber-500/30 px-1.5 py-0.5 rounded">
            Conflict
          </span>
        ) : null}
      </div>
      <p className="text-[13px] text-zinc-200">
        {row.conditionLabel}:{" "}
        <span className="text-zinc-400">
          {row.fromState ?? "—"} → {row.toState}
        </span>
      </p>
      {row.explanation ? (
        <p className="text-[12px] text-zinc-500 mt-1">{row.explanation}</p>
      ) : null}
    </li>
  );
}

function Section({
  title,
  children,
  empty,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
  testId: string;
}) {
  if (empty) return null;
  return (
    <section data-testid={testId} className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function PortfolioBriefPanel({ className }: { className?: string }) {
  const [brief, setBrief] = useState<PortfolioBriefDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/portfolio/brief?days=7", {
          credentials: "same-origin",
        });
        if (res.status === 401 || res.status === 403) {
          setForbidden(true);
          setBrief(null);
          return;
        }
        if (!res.ok) {
          setError("Could not load Portfolio Brief.");
          return;
        }
        const data = (await res.json()) as { brief?: PortfolioBriefDto };
        if (data.brief) setBrief(data.brief);
      } catch {
        setError("Could not load Portfolio Brief.");
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (forbidden) {
    return (
      <div
        className={cn(
          "rounded-xl border border-zinc-800 bg-zinc-950/50 p-4",
          className
        )}
        data-testid="portfolio-brief"
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-1">
          Portfolio Brief
        </h2>
        <p className="text-[13px] text-zinc-500 mb-3">
          Personalized briefs require an active plan.
        </p>
        <Link
          href="/pricing"
          className="text-[12px] text-emerald-400 hover:underline"
        >
          View pricing
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden",
        className
      )}
      data-testid="portfolio-brief"
      data-guide="portfolio-brief"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/40">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Portfolio Brief
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            What happened across your companies that deserves attention
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
          aria-label="Refresh brief"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", pending && "animate-spin")} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {error ? (
          <p className="text-[13px] text-rose-300">{error}</p>
        ) : null}

        {!brief && pending ? (
          <p className="text-[13px] text-zinc-500">Building your brief…</p>
        ) : null}

        {brief ? (
          <>
            <p className="text-[13px] text-zinc-300">{brief.headline}</p>

            {brief.meta.emptyPortfolio ? (
              <p className="text-[13px] text-zinc-500">
                <Link
                  href="/dashboard?view=portfolio"
                  className="text-emerald-400 hover:underline"
                >
                  Add companies
                </Link>{" "}
                to start monitoring.
              </p>
            ) : null}

            <Section
              title="Needs review"
              testId="portfolio-brief-needs-review"
              empty={brief.sections.needsReview.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.needsReview.map((i) => (
                  <ItemRow key={i.id} item={i} />
                ))}
              </ul>
            </Section>

            <Section
              title="Thesis changes"
              testId="portfolio-brief-thesis"
              empty={brief.sections.thesisChanges.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.thesisChanges.map((t) => (
                  <ThesisRow
                    key={`${t.thesisId}-${t.conditionId}-${t.toState}`}
                    row={t}
                  />
                ))}
              </ul>
            </Section>

            <Section
              title="Financial changes"
              testId="portfolio-brief-financial"
              empty={brief.sections.financial.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.financial.map((i) => (
                  <ItemRow key={`f-${i.id}`} item={i} />
                ))}
              </ul>
            </Section>

            <Section
              title="Capital"
              testId="portfolio-brief-capital"
              empty={brief.sections.capital.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.capital.map((i) => (
                  <ItemRow key={`c-${i.id}`} item={i} />
                ))}
              </ul>
            </Section>

            <Section
              title="Insiders"
              testId="portfolio-brief-insiders"
              empty={brief.sections.insiders.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.insiders.map((i) => (
                  <ItemRow key={`i-${i.id}`} item={i} />
                ))}
              </ul>
            </Section>

            <Section
              title="Ownership"
              testId="portfolio-brief-ownership"
              empty={brief.sections.ownership.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.ownership.map((i) => (
                  <ItemRow key={`o-${i.id}`} item={i} />
                ))}
              </ul>
            </Section>

            <Section
              title="Upcoming"
              testId="portfolio-brief-upcoming"
              empty={brief.sections.upcoming.length === 0}
            >
              <ul className="space-y-2">
                {brief.sections.upcoming.map((u) => (
                  <li
                    key={`${u.symbol}-${u.date}`}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-[13px] text-zinc-300"
                  >
                    <Link
                      href={`/ticker/${u.symbol}`}
                      className="font-mono text-emerald-400 hover:underline mr-2"
                    >
                      {u.symbol}
                    </Link>
                    {u.label} · {u.date}
                  </li>
                ))}
              </ul>
            </Section>

            {brief.sections.quietCompanies.length > 0 ? (
              <section data-testid="portfolio-brief-quiet">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                  Quiet companies
                </h3>
                <p className="text-[12px] text-zinc-500">
                  No material events in this window:{" "}
                  {brief.sections.quietCompanies.join(", ")}
                </p>
              </section>
            ) : null}

            <p className="text-[11px] text-zinc-600">
              Last {brief.meta.windowDays}d · SEC/company data — quotes not
              required.{" "}
              <Link
                href="/dashboard?view=watchtower"
                className="text-zinc-400 hover:underline"
              >
                Open Watchtower
              </Link>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
