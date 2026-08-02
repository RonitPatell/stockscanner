"use client";

import { Suspense, lazy } from "react";
import { MonitorLoadBoundary } from "./progressive/MonitorLoadBoundary.ts";
import { SecondaryPanelSkeleton } from "./progressive/skeletons.ts";

/**
 * Secondary Monitor features — after first interactive paint.
 * Each panel is error-isolated; failure never blanks the scanner shell.
 */
const DilutionTimelineLazy = lazy(async () => {
  const m = await import("../DilutionRadar");
  return { default: m.DilutionRadar };
});

const TraderFeedbackLazy = lazy(async () => {
  const m = await import("../trader-feedback/TraderFeedbackPanel");
  return { default: m.TraderFeedbackPanel };
});

const AutopsyLazy = lazy(async () => {
  const m = await import("../WatchlistAutopsy");
  return { default: m.WatchlistAutopsy };
});

export function MonitorSecondaryPanels({
  watchlistSymbols = [],
}: {
  watchlistSymbols?: string[];
}) {
  return (
    <aside
      className="tt-monitor__secondary max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-3 space-y-3"
      data-testid="monitor-secondary"
      data-progressive="after-first-paint"
    >
      <MonitorLoadBoundary
        id="secondary-dilution"
        label="Dilution history unavailable"
      >
        <Suspense fallback={<SecondaryPanelSkeleton label="dilution history" />}>
          <section
            data-testid="monitor-secondary-dilution"
            className="min-w-0"
          >
            <DilutionTimelineLazy />
          </section>
        </Suspense>
      </MonitorLoadBoundary>

      <MonitorLoadBoundary
        id="secondary-personal"
        label="Personal panels unavailable"
      >
        <div className="grid gap-3 lg:grid-cols-2 min-w-0">
          <Suspense
            fallback={<SecondaryPanelSkeleton label="trader feedback" />}
          >
            <section
              data-testid="monitor-secondary-feedback"
              className="min-w-0"
            >
              <TraderFeedbackLazy />
            </section>
          </Suspense>
          <Suspense fallback={<SecondaryPanelSkeleton label="autopsy" />}>
            <section
              data-testid="monitor-secondary-autopsy"
              className="min-w-0"
            >
              <AutopsyLazy symbols={watchlistSymbols} />
            </section>
          </Suspense>
        </div>
      </MonitorLoadBoundary>
    </aside>
  );
}
