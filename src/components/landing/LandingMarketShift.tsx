"use client";

import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { LandingScrollTour } from "./LandingScrollTour";

const MODES = [
  {
    id: "quiet",
    label: "Quiet week",
    sub: "Monday · low volume",
    events: 2,
    reviews: 0,
    thesis: 0,
    hours: 0,
    rows: ["No new 8-K", "Financials unchanged"],
  },
  {
    id: "busy",
    label: "Earnings week",
    sub: "Thursday · report day",
    events: 14,
    reviews: 6,
    thesis: 2,
    hours: 3,
    rows: [
      "8-K: earnings release",
      "Quarterly delta: margin moved",
      "Form 4 cluster after print",
      "Thesis condition flagged",
    ],
  },
] as const;

function ModeStats({ mode }: { mode: (typeof MODES)[number] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 max-w-sm">
      <div className="border-t border-[var(--border-medium)] pt-3">
        <dt className="mk-tick mb-1">Events surfaced</dt>
        <dd className="mk-stat text-2xl text-[var(--text-primary)]">
          <CountUp key={`${mode.id}-ev`} end={mode.events} />
        </dd>
      </div>
      <div className="border-t border-[var(--border-medium)] pt-3">
        <dt className="mk-tick mb-1">Need review</dt>
        <dd className="mk-stat text-2xl text-[var(--text-primary)]">
          <CountUp key={`${mode.id}-rv`} end={mode.reviews} />
        </dd>
      </div>
      <div className="border-t border-[var(--border-medium)] pt-3">
        <dt className="mk-tick mb-1">Thesis flags</dt>
        <dd className="mk-stat text-2xl text-[var(--text-primary)]">
          <CountUp key={`${mode.id}-th`} end={mode.thesis} />
        </dd>
      </div>
      <div className="border-t border-[var(--border-medium)] pt-3">
        <dt className="mk-tick mb-1">Hours saved · est.</dt>
        <dd className="mk-stat text-2xl text-[var(--text-primary)]">
          <CountUp key={`${mode.id}-hr`} end={mode.hours} suffix="+" />
        </dd>
      </div>
    </dl>
  );
}

function ModeScene({ mode }: { mode: (typeof MODES)[number] }) {
  const busy = mode.id === "busy";
  return (
    <div
      className={cn(
        "mk-panel mk-corners rounded-lg p-5 sm:p-6 landing-slide-in",
        busy && "landing-shift-scene-busy"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="mk-tick text-zinc-500">Portfolio · Watchtower</p>
          <p className="text-sm font-semibold text-zinc-100 mt-0.5">{mode.label}</p>
        </div>
        <span className="text-[10px] font-mono uppercase text-zinc-500 border border-zinc-700 px-2 py-1 rounded">
          Sample UI
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 mb-3">{mode.sub}</p>
      <ul className="space-y-2 min-h-[140px]">
        {mode.rows.map((row, ri) => (
          <li
            key={row}
            className={cn(
              "trader-feed-row flex items-center gap-2 px-3 py-2.5 rounded border text-[12px]",
              busy
                ? "border-amber-500/30 bg-amber-500/5 text-zinc-200"
                : "border-zinc-800/80 bg-zinc-950/40 text-zinc-400"
            )}
            style={{ ["--row-i" as string]: ri }}
          >
            <span className="font-mono text-emerald-400/90 text-[11px]">EX</span>
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingMarketShift() {
  return (
    <LandingScrollTour
      id="forecast"
      steps={MODES.length}
      labels={MODES.map((m) => m.label)}
      testId="landing-market-shift"
      renderStep={(i) => {
        const mode = MODES[i]!;
        return (
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-5">
              <div className="mk-section-rule">
                <span className="mk-stat text-[13px] text-[var(--accent)]">03</span>
                <span className="mk-tick !text-[var(--text-secondary)]">Forecast</span>
              </div>
              <h2 className="mk-display text-2xl sm:text-4xl max-w-md">
                {i === 0
                  ? "The market moves. Your queue moved first."
                  : "Earnings week fills the queue fast."}
              </h2>
              <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                {i === 0
                  ? "A quiet week looks nothing like earnings week. Keep scrolling to compare."
                  : "TrustTicker surfaces filings, deltas, and thesis flags before you open ten tabs."}
              </p>
              <ModeStats mode={mode} />
            </div>
            <ModeScene mode={mode} />
          </div>
        );
      }}
    />
  );
}
