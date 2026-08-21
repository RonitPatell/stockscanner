"use client";

import { LANDING_PRODUCT_CONCEPTS } from "./LandingProductPreview";
import { TraderConceptViz } from "./LandingTraderViz";
import { LandingScrollTour } from "./LandingScrollTour";

export function LandingProductSequence() {
  const concepts = LANDING_PRODUCT_CONCEPTS;
  const labels = concepts.map((c) => c.name);

  return (
    <LandingScrollTour
      id="product"
      steps={concepts.length}
      labels={labels}
      testId="landing-concepts"
      renderStep={(i) => {
        const c = concepts[i]!;
        return (
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="space-y-4">
              {i === 0 ? (
                <>
                  <div className="mk-section-rule">
                    <span className="mk-stat text-[13px] text-[var(--accent)]">01</span>
                    <span className="mk-tick !text-[var(--text-secondary)]">Product</span>
                  </div>
                  <h2 className="mk-display text-2xl sm:text-4xl max-w-md">
                    Five tools. One clear loop.
                  </h2>
                </>
              ) : (
                <p className="mk-tick text-[var(--text-muted)]">Product</p>
              )}

              <div data-testid={`landing-concept-${c.id}`}>
                <p className="mk-tick text-emerald-400/90 mb-2">{c.name}</p>
                <h3 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] mb-3">
                  {c.name}
                </h3>
                <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                  {c.blurb}
                </p>
              </div>
              <p className="text-[12px] text-[var(--text-muted)]">
                Keep scrolling — the next tool appears as you move.
              </p>
            </div>

            <div className="mk-panel mk-corners rounded-lg p-5 sm:p-6 min-h-[200px]">
              <TraderConceptViz concept={c.id} />
            </div>
          </div>
        );
      }}
    />
  );
}
