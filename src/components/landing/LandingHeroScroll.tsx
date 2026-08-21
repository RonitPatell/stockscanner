"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingHeroDesk } from "./LandingHeroDesk";
import { SnapSection } from "./SnapSlides";
import { TrackLink } from "./TrackLink";
import {
  TRUSTTICKER_ANNUAL_LABEL,
  TRUSTTICKER_MONTHLY_LABEL,
  TRUSTTICKER_TRIAL_DAYS,
} from "@/lib/billing/pricing";
import { useParallaxScroll, usePrefersReducedMotion } from "./use-scroll-progress";

export function LandingHeroScroll({
  displayName,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  isSignedIn,
}: {
  displayName?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  isSignedIn: boolean;
}) {
  const parallax = useParallaxScroll(0.22);
  const reduced = usePrefersReducedMotion();

  return (
    <SnapSection
      className="landing-hero-slide relative overflow-hidden !p-0"
      testId="landing-hero"
    >
      <div
        className="absolute inset-0 grid-bg pointer-events-none landing-grid-drift"
        style={reduced ? undefined : { transform: `translate3d(0, ${parallax * 0.4}px, 0)` }}
        aria-hidden
      />
      <div className="mk-glow-top absolute inset-0 pointer-events-none" aria-hidden />
      <div className="landing-orb landing-orb-a pointer-events-none" aria-hidden />
      <div className="landing-orb landing-orb-b pointer-events-none" aria-hidden />
      <div className="trader-hero-scan pointer-events-none" aria-hidden />

      <div
        className="relative flex-1 flex flex-col justify-center max-w-6xl w-full mx-auto px-4 sm:px-6 pt-20 sm:pt-22 pb-6"
        aria-labelledby="hero-heading"
      >
        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-8 lg:gap-12 items-center w-full">
          <div className="max-w-xl">
            <div className="landing-fade-up flex items-center gap-3 mb-4">
              <span className="landing-pulse-dot" aria-hidden />
              <p className="mk-tick text-emerald-400/90" data-testid="landing-brand">
                TrustTicker · Live SEC monitoring
              </p>
            </div>

            <h1 id="hero-heading" className="landing-headline mb-6 text-[var(--text-primary)]">
              <span className="landing-headline-line landing-fade-up landing-delay-1 block">
                The research brain
              </span>
              <span className="landing-headline-line landing-fade-up landing-delay-2 block text-emerald-400/95">
                for your portfolio.
              </span>
            </h1>

            <p className="landing-fade-up landing-delay-3 text-[15px] sm:text-[17px] text-[var(--text-secondary)] max-w-lg mb-4 leading-[1.7]">
              TrustTicker monitors SEC filings, financials, insider activity, and
              capital events across the companies you follow. You see what changed
              and why it may matter. Not buy or sell advice.
              {isSignedIn && displayName ? ` Welcome back, ${displayName}.` : ""}
            </p>

            <p className="landing-fade-up landing-delay-3 text-[13px] text-[var(--text-tertiary)] max-w-lg mb-8">
              Built for people who want clarity without another cluttered terminal.
            </p>

            <div
              className="landing-fade-up landing-delay-4 flex flex-col min-[390px]:flex-row min-[390px]:items-center gap-3"
              data-testid="landing-hero-ctas"
            >
              <TrackLink event="landing_cta_trial" props={{ placement: "hero" }} href={primaryHref}>
                <Button
                  size="lg"
                  className="text-[15px] px-8 w-full min-[390px]:w-auto cta-glow"
                  data-testid="landing-cta-trial"
                >
                  {primaryLabel}
                  <ArrowRight className="w-5 h-5" aria-hidden />
                </Button>
              </TrackLink>
              <TrackLink event="landing_cta_replay" props={{ placement: "hero" }} href={secondaryHref}>
                <Button
                  variant="outline"
                  size="lg"
                  className="text-[15px] px-8 w-full min-[390px]:w-auto"
                  data-testid="landing-cta-demo"
                >
                  {secondaryLabel}
                </Button>
              </TrackLink>
            </div>

            <p
              className="landing-fade-up landing-delay-5 mk-tick mt-5 sm:mt-6 text-[var(--text-tertiary)] normal-case !tracking-[0.06em]"
              data-testid="landing-pricing-line"
            >
              {TRUSTTICKER_MONTHLY_LABEL}/month or {TRUSTTICKER_ANNUAL_LABEL}{" "}
              after trial · {TRUSTTICKER_TRIAL_DAYS}-day free trial · cancel anytime
            </p>
          </div>

          <div
            className="landing-fade-up landing-delay-2 w-full max-w-lg mx-auto lg:max-w-none lg:mx-0 landing-hero-preview"
            style={reduced ? undefined : { transform: `translate3d(0, ${-parallax * 0.35}px, 0)` }}
          >
            <LandingHeroDesk />
          </div>
        </div>
      </div>

      <div className="landing-scroll-cue hidden sm:flex pb-6" aria-hidden>
        <span className="mk-tick">Scroll</span>
        <span className="landing-scroll-line" />
      </div>
    </SnapSection>
  );
}
