"use client";

import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-scroll-progress";
import { ScrollHint, SnapSlide, StepProgress, useSnapSlideIndex } from "./SnapSlides";

const STEPS = [
  {
    id: "watchtower",
    tag: "Watchtower",
    title: "See what needs your attention first",
    body: "Your portfolio drives the queue. New filings, financial moves, insider trades, and capital events sort by priority so you review the important stuff first.",
    rows: [
      { sym: "EXAMPLE", text: "Shelf registration filed", level: "HIGH" },
      { sym: "EXAMPLE", text: "Form 4 cluster (3 insiders)", level: "REVIEW" },
      { sym: "EXAMPLE", text: "Quarterly margin delta", level: "WATCH" },
    ],
  },
  {
    id: "changed",
    tag: "What Changed",
    title: "One timeline for every material move",
    body: "Open any ticker and see what shifted since your last visit. Each card links back to SEC sources. Plain language, no jargon.",
    rows: [
      { when: "Today", text: "New 8-K: leadership change" },
      { when: "2 days ago", text: "Insider open-market buys" },
      { when: "1 week ago", text: "Cash line moved up 12%" },
    ],
  },
  {
    id: "thesis",
    tag: "Thesis",
    title: "Your reasons, checked against new facts",
    body: "Write why you follow a stock and set conditions to watch. TrustTicker flags when new data supports or challenges your view. Private to you.",
    rows: [
      { label: "Revenue still growing year over year", ok: true },
      { label: "Cash runway above four quarters", ok: true },
      { label: "No surprise shelf this month", ok: false },
    ],
  },
  {
    id: "brief",
    tag: "Portfolio Brief",
    title: "Your whole book in one morning read",
    body: "Movers, earnings, and overnight events across every name you monitor. Start the day knowing what changed without opening ten tabs.",
    rows: [
      "3 portfolio names with new filings",
      "1 capital event flagged for review",
      "2 thesis conditions moved to watch",
    ],
  },
] as const;

function StepMock({ stepId }: { stepId: (typeof STEPS)[number]["id"] }) {
  const step = STEPS.find((s) => s.id === stepId);
  if (!step) return null;

  switch (stepId) {
    case "watchtower":
      return (
        <ul className="space-y-2">
          {step.rows.map((row, ri) => {
            if (typeof row === "string" || !("sym" in row)) return null;
            return (
              <li
                key={row.text}
                className="trader-feed-row flex items-center gap-3 rounded-md border border-zinc-800/90 bg-zinc-950/70 px-3 py-2.5"
                style={{ ["--row-i" as string]: ri }}
              >
                <span className="font-mono text-xs font-semibold text-emerald-400 w-14 shrink-0">
                  {row.sym}
                </span>
                <span className="text-[13px] text-zinc-200 flex-1">{row.text}</span>
                <span className="text-[10px] uppercase tracking-wide text-amber-300/90 shrink-0">
                  {row.level}
                </span>
              </li>
            );
          })}
        </ul>
      );
    case "changed":
      return (
        <ul className="space-y-3 border-l border-emerald-500/30 pl-4">
          {step.rows.map((row, ri) => {
            if (typeof row === "string" || !("when" in row)) return null;
            return (
              <li
                key={row.text}
                className="trader-feed-row"
                style={{ ["--row-i" as string]: ri }}
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{row.when}</p>
                <p className="text-[13px] text-zinc-200 mt-0.5">{row.text}</p>
              </li>
            );
          })}
        </ul>
      );
    case "thesis":
      return (
        <ul className="space-y-2">
          {step.rows.map((row, ri) => {
            if (typeof row === "string" || !("label" in row)) return null;
            return (
              <li
                key={row.label}
                className="trader-feed-row flex items-center gap-2.5 rounded-md border border-zinc-800/80 px-3 py-2.5 text-[13px] text-zinc-200"
                style={{ ["--row-i" as string]: ri }}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    row.ok ? "bg-emerald-400" : "bg-amber-400"
                  )}
                />
                {row.label}
              </li>
            );
          })}
        </ul>
      );
    case "brief":
      return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 trader-feed-row" style={{ ["--row-i" as string]: 0 }}>
          <p className="mk-tick text-zinc-500 mb-3">Today&apos;s brief</p>
          <ul className="space-y-2 text-[13px] text-zinc-300">
            {step.rows.map((line) =>
              typeof line === "string" ? <li key={line}>{line}</li> : null
            )}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

export function LandingPinnedOperations() {
  const reduced = usePrefersReducedMotion();
  const { active, register } = useSnapSlideIndex(STEPS.length);
  const labels = STEPS.map((s) => s.tag);

  if (reduced) {
    return (
      <section id="operations" className="border-y mk-hairline bg-[var(--bg-graphite)]/25 py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto space-y-12" data-testid="landing-operations">
          <header className="max-w-xl">
            <div className="mk-section-rule mb-6">
              <span className="mk-stat text-[13px] text-[var(--accent)]">02</span>
              <span className="mk-tick !text-[var(--text-secondary)]">Operations</span>
            </div>
            <h2 className="mk-display text-2xl sm:text-4xl mb-3">
              We learn your book, then we watch it.
            </h2>
          </header>
          {STEPS.map((step) => (
            <article key={step.id} data-testid={`landing-ops-panel-${step.id}`}>
              <p className="mk-tick text-emerald-400/90 mb-2">{step.tag}</p>
              <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{step.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{step.body}</p>
              <StepMock stepId={step.id} />
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="operations"
      className="landing-ops-sequence bg-[var(--bg-graphite)]/20"
      data-testid="landing-operations"
      aria-label="Product operations walkthrough"
    >
      {STEPS.map((step, i) => (
        <SnapSlide
          key={step.id}
          index={i}
          register={register}
          className="landing-ops-slide"
          testId={`landing-ops-slide-${step.id}`}
        >
          <div className="landing-snap-slide-inner max-w-6xl mx-auto px-4 sm:px-6 w-full">
            <div className="grid lg:grid-cols-[minmax(0,0.44fr)_minmax(0,0.56fr)] gap-10 lg:gap-14 items-center w-full">
              <div className="space-y-6">
                {i === 0 ? (
                  <>
                    <div className="mk-section-rule">
                      <span className="mk-stat text-[13px] text-[var(--accent)]">02</span>
                      <span className="mk-tick !text-[var(--text-secondary)]">Operations</span>
                    </div>
                    <h2 className="mk-display text-2xl sm:text-[2.35rem] leading-tight max-w-md">
                      We learn your book, then we watch it.
                    </h2>
                    <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                      Scroll stops at each step so you can read the sample UI. Keep
                      scrolling when you are ready for the next layer.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mk-tick text-[var(--text-muted)]">Operations</p>
                    <h2 className="mk-display text-2xl sm:text-[2.35rem] leading-tight max-w-md">
                      {step.title}
                    </h2>
                    <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                      {step.body}
                    </p>
                  </>
                )}

                <StepProgress total={STEPS.length} active={active} labels={labels} />

                <ScrollHint
                  label={
                    i < STEPS.length - 1 ? "Scroll to next step" : "Scroll to forecast section"
                  }
                />
              </div>

              <article
                className="mk-panel mk-corners rounded-lg p-6 sm:p-8 landing-ops-card"
                data-testid={`landing-ops-panel-${step.id}`}
              >
                <div className="flex items-center justify-between gap-3 mb-5">
                  <p className="mk-tick text-emerald-400/90">{step.tag}</p>
                  <span className="text-[10px] font-mono uppercase text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded">
                    Sample UI
                  </span>
                </div>
                {i === 0 ? (
                  <>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                      {step.title}
                    </h3>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-5">
                      {step.body}
                    </p>
                  </>
                ) : null}
                <StepMock stepId={step.id} />
              </article>
            </div>
          </div>
        </SnapSlide>
      ))}
    </section>
  );
}
