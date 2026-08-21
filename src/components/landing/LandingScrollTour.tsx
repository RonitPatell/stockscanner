"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useScrollProgress } from "./use-scroll-progress";
import { StepProgress } from "./SnapSlides";

/**
 * Short sticky scrubber: a little scroll advances through steps.
 * Height is ~0.55vh per step so the whole tour is quick.
 */
export function LandingScrollTour({
  id,
  steps,
  labels,
  className,
  testId,
  renderStep,
}: {
  id?: string;
  steps: number;
  labels?: string[];
  className?: string;
  testId?: string;
  renderStep: (index: number, active: number) => ReactNode;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const progress = useScrollProgress(ref);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (steps <= 1) {
      setActive(0);
      return;
    }
    const idx = Math.min(steps - 1, Math.floor(progress * steps));
    setActive(idx);
  }, [progress, steps]);

  if (reduced) {
    return (
      <section id={id} className={cn("py-14 px-4 sm:px-6", className)} data-testid={testId}>
        <div className="max-w-6xl mx-auto space-y-10">
          {Array.from({ length: steps }, (_, i) => (
            <div key={i}>{renderStep(i, i)}</div>
          ))}
        </div>
      </section>
    );
  }

  /* Short track: a few wheel ticks advance each step */
  const trackMin = `${Math.max(95, Math.round(55 + steps * 30))}vh`;

  return (
    <section
      id={id}
      ref={ref}
      className={cn("landing-scroll-tour relative", className)}
      style={{ minHeight: trackMin }}
      data-testid={testId}
    >
      <div className="landing-scroll-tour-sticky sticky top-0 h-[100dvh] flex items-center overflow-hidden pt-14 box-border">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StepProgress total={steps} active={active} labels={labels} />
            <div className="landing-tour-bar" aria-hidden>
              <div
                className="landing-tour-bar-fill"
                style={{ width: `${((active + 1) / steps) * 100}%` }}
              />
            </div>
          </div>
          <div
            key={active}
            className="landing-tour-panel landing-snap-active"
          >
            {renderStep(active, active)}
          </div>
        </div>
      </div>
    </section>
  );
}
