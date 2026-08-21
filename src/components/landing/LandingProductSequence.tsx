"use client";

import { LANDING_PRODUCT_CONCEPTS } from "./LandingProductPreview";
import { TraderConceptViz } from "./LandingTraderViz";
import { ScrollHint, SnapSlide, StepProgress, useSnapSlideIndex } from "./SnapSlides";
import { usePrefersReducedMotion } from "./use-scroll-progress";

export function LandingProductSequence() {
  const concepts = LANDING_PRODUCT_CONCEPTS;
  const reduced = usePrefersReducedMotion();
  const { active, register } = useSnapSlideIndex(concepts.length);
  const labels = concepts.map((c) => c.name);

  if (reduced) {
    return (
      <section id="product" className="py-16 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid gap-10" data-testid="landing-concepts">
          {concepts.map((c) => (
            <article key={c.id} data-testid={`landing-concept-${c.id}`}>
              <h3 className="text-xl font-semibold mb-2">{c.name}</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">{c.blurb}</p>
              <TraderConceptViz concept={c.id} />
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="product" className="landing-product-sequence" aria-label="Product tour">
      {concepts.map((c, i) => (
        <SnapSlide
          key={c.id}
          index={i}
          register={register}
          className="landing-snap-slide landing-product-slide"
          testId={`landing-concept-slide-${c.id}`}
        >
          <div className="landing-snap-slide-inner max-w-6xl mx-auto px-4 sm:px-6 w-full">
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
                    <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                      Each stop shows one part of the desk. Scroll when you are ready for
                      the next tool.
                    </p>
                  </>
                ) : null}

                <div data-testid={`landing-concept-${c.id}`}>
                  <p className="mk-tick text-emerald-400/90 mb-2">{c.name}</p>
                  <h3 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] mb-3">
                    {c.name}
                  </h3>
                  <p className="text-sm sm:text-[15px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                    {c.blurb}
                  </p>
                </div>

                <StepProgress total={concepts.length} active={active} labels={labels} />
                <ScrollHint
                  label={
                    i < concepts.length - 1
                      ? "Scroll to next tool"
                      : "Scroll to operations"
                  }
                />
              </div>

              <div className="mk-panel mk-corners rounded-lg p-5 sm:p-6 min-h-[200px]">
                <TraderConceptViz concept={c.id} />
              </div>
            </div>
          </div>
        </SnapSlide>
      ))}
    </section>
  );
}
