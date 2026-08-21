"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrackLink } from "./TrackLink";
import { TRUSTTICKER_TRIAL_CTA } from "@/lib/billing/pricing";
import { TraderFilingRail, TraderPortfolioGrid } from "./LandingTraderViz";
import { Reveal } from "./Reveal";

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
    <p className="mk-stat text-4xl text-emerald-400/30 text-center py-4">7 days</p>
  );
}

export function LandingForwardPath({
  primaryHref,
  isSubscribed,
}: {
  primaryHref: string;
  isSubscribed: boolean;
}) {
  return (
    <section
      id="path"
      className="py-14 sm:py-16 px-4 sm:px-6 border-t mk-hairline"
      data-testid="landing-forward-path"
    >
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="mk-section-rule mb-6">
            <span className="mk-stat text-[13px] text-[var(--accent)]">04</span>
            <span className="mk-tick !text-[var(--text-secondary)]">Forward path</span>
          </div>
          <h2 className="mk-display text-2xl sm:text-4xl max-w-xl mb-3">
            From signup to daily habit in four steps.
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-lg mb-10 leading-relaxed">
            Real SEC data behind every number in the desk.
          </p>
        </Reveal>

        <div className="grid sm:grid-cols-2 gap-5 lg:gap-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 60}>
              <article className="mk-panel mk-corners rounded-lg p-5 h-full landing-snap-active">
                <div className="flex items-start gap-4">
                  <span className="mk-stat text-2xl text-emerald-400/40 shrink-0">{s.n}</span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">{s.title}</h3>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.body}</p>
                    <div className="pt-1">
                      <ForwardViz kind={s.viz} />
                    </div>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200} className="mt-10">
          {isSubscribed ? (
            <Link href="/dashboard">
              <Button size="lg" className="cta-glow">
                Open Portfolio
                <ArrowRight className="w-5 h-5" aria-hidden />
              </Button>
            </Link>
          ) : (
            <TrackLink event="landing_cta_trial" props={{ placement: "forward" }} href={primaryHref}>
              <Button size="lg" className="cta-glow">
                {TRUSTTICKER_TRIAL_CTA}
                <ArrowRight className="w-5 h-5" aria-hidden />
              </Button>
            </TrackLink>
          )}
        </Reveal>
      </div>
    </section>
  );
}
