"use client";

import { CountUp } from "./CountUp";
import { TraderDualTape } from "./LandingTraderViz";

const STATS = [
  { label: "SEC-backed datasets", end: 6, suffix: "+" },
  { label: "Research tabs per ticker", end: 9, suffix: "" },
  { label: "Trial days · full access", end: 7, suffix: "" },
  { label: "USD per month · full platform", static: "$19.99" },
] as const;

export function LandingStatsStrip() {
  return (
    <section
      className="py-10 sm:py-12 px-4 sm:px-6 border-y mk-hairline bg-[var(--bg-panel)]/40 landing-snap-active"
      data-testid="landing-stats-strip"
    >
      <div className="max-w-6xl mx-auto space-y-6">
        <TraderDualTape />
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="trader-stat-cell border-t border-[var(--border-medium)] pt-4"
              style={{ ["--row-i" as string]: i }}
            >
              <dt className="mk-tick mb-2">{s.label}</dt>
              <dd className="mk-stat text-3xl sm:text-4xl text-[var(--text-primary)]">
                {"static" in s ? s.static : <CountUp end={s.end} suffix={s.suffix} />}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
