"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrackLink } from "./TrackLink";
import { TRUSTTICKER_TRIAL_CTA } from "@/lib/billing/pricing";
import { TraderFilingRail, TraderPortfolioGrid } from "./LandingTraderViz";
import { ScrollHint, SnapSlide, StepProgress, useSnapSlideIndex } from "./SnapSlides";
import { usePrefersReducedMotion } from "./use-scroll-progress";

const STEPS = [
  {
    n: "1",
    title: "Start your trial",
    body: "Full platform access for 7 days when eligible. No permanent free tier.",
    viz: "trial" as const,
  },
  {
    n: "2",
    title: "Add your names",
    body: "Drop in tickers you own or watch. TrustTicker begins hydration from SEC sources.",
    viz: "portfolio" as const,
  },
  {
    n: "3",
    title: "Set your thesis",
    body: "Write why each name matters and what would change your view. Private to you.",
    viz: "thesis" as const,
  },
  {
    n: "4",
    title: "Check in daily",
    body: "Watchtower and Portfolio Brief show what moved. Research when something needs depth.",
    viz: "daily" as const,
  },
] as const;

function ForwardViz({ kind }: { kind: (typeof STEPS)[number]["viz"] }) {
  if (kind === "portfolio") return <TraderPortfolioGrid />;
  if (kind === "thesis") {
    return (
      <div className="space-y-2">
        {["Why I own it", "What would break my view", "Conditions to watch"].map((l, i) => (
          <div
            key={l}
            className="trader-feed-row rounded border border-zinc-800 px-3 py-2 text-[12px] text-zinc-300"
            style={{ ["--row-i" as string]: i }}
          >
            {l}
          </div>
        ))}
      </div>
    );
  }
  if (kind === "daily") return <TraderFilingRail className="justify-center" />;
  return (
    <p className="mk-stat text-5xl text-emerald-400/30 text-center py-8">7 days</p>
  );
}

export function LandingForwardPath({
  primaryHref,
  isSubscribed,
}: {
  primaryHref: string;
  isSubscribed: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const { active, register } = useSnapSlideIndex(STEPS.length);
  const labels = STEPS.map((s) => s.title);

  if (reduced) {
    return (
      <section className="py-16 px-4 sm:px-6" data-testid="landing-forward-path">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 gap-8">
          {STEPS.map((s) => (
            <div key={s.n}>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="landing-forward-sequence" data-testid="landing-forward-path">
      {STEPS.map((s, i) => (
        <SnapSlide
          key={s.n}
          index={i}
          register={register}
          className="landing-forward-slide bg-[var(--bg-graphite)]/30"
        >
          <div className="landing-snap-slide-inner max-w-6xl mx-auto px-4 sm:px-6 w-full">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div className="space-y-5">
                {i === 0 ? (
                  <>
                    <p className="mk-tick text-emerald-400/90">Forward path</p>
                    <h2 id="forward-heading" className="mk-display text-2xl sm:text-4xl max-w-md">
                      From signup to daily habit in four steps.
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
                      Each stop is one step. Real SEC data behind every number in the desk.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="mk-stat text-4xl text-emerald-400/35 block">{s.n}</span>
                    <h3 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
                      {s.title}
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-md">
                      {s.body}
                    </p>
                  </>
                )}
                <StepProgress total={STEPS.length} active={active} labels={labels} />
                <ScrollHint
                  label={i < STEPS.length - 1 ? "Scroll to next step" : "Scroll to evidence"}
                />
                {i === STEPS.length - 1 && !isSubscribed && (
                  <TrackLink event="landing_cta_trial" props={{ placement: "forward" }} href={primaryHref}>
                    <Button size="lg" className="cta-glow mt-4">
                      {TRUSTTICKER_TRIAL_CTA}
                      <ArrowRight className="w-5 h-5" aria-hidden />
                    </Button>
                  </TrackLink>
                )}
                {i === STEPS.length - 1 && isSubscribed && (
                  <Link href="/dashboard">
                    <Button size="lg" className="cta-glow mt-4">
                      Open Portfolio
                      <ArrowRight className="w-5 h-5" aria-hidden />
                    </Button>
                  </Link>
                )}
              </div>
              <div className="mk-panel mk-corners rounded-lg p-6 sm:p-8 min-h-[200px] flex items-center justify-center">
                <ForwardViz kind={s.viz} />
              </div>
            </div>
          </div>
        </SnapSlide>
      ))}
    </section>
  );
}
