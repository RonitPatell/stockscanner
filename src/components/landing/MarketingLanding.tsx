import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Reveal } from "./Reveal";
import { TrackLink } from "./TrackLink";
import { LandingProductSequence } from "./LandingProductSequence";
import { LandingHeroScroll } from "./LandingHeroScroll";
import { LandingPinnedOperations } from "./LandingPinnedOperations";
import { LandingMarketShift } from "./LandingMarketShift";
import { LandingForwardPath } from "./LandingForwardPath";
import { LandingStatsStrip } from "./LandingStatsStrip";
import { LandingScrollSnap } from "./LandingScrollSnap";
import {
  TRUSTTICKER_ANNUAL_LABEL,
  TRUSTTICKER_MONTHLY_LABEL,
  TRUSTTICKER_MONTHLY_MO,
  TRUSTTICKER_TRIAL_CTA,
  TRUSTTICKER_TRIAL_DAYS,
} from "@/lib/billing/pricing";
import { PricingPlanCards } from "@/components/pricing/PricingPlanCards";
import type { PublicCaseStudy } from "@/lib/calibration/service";

const FAQ = [
  {
    q: "What does TrustTicker actually do?",
    a: "TrustTicker watches the companies you care about. It reads SEC filings, financials, insider trades, capital raises, and ownership changes, then shows you what may affect your view of the stock. Main areas are Watchtower, Thesis Monitor, What Changed, Capital Risk, and Portfolio Brief.",
  },
  {
    q: "Is this investment advice?",
    a: "No. TrustTicker is an informational monitoring tool. You make your own decisions. Past reactions do not guarantee future results. We do not promise guaranteed returns or market-beating performance.",
  },
  {
    q: "How does pricing work?",
    a: `One product with the full platform. ${TRUSTTICKER_MONTHLY_LABEL}/month or ${TRUSTTICKER_ANNUAL_LABEL} after a ${TRUSTTICKER_TRIAL_DAYS}-day free trial when eligible. There is no permanent free tier. Public company pages are for discovery. Portfolio, Watchtower, alerts, and thesis need an active plan.`,
  },
  {
    q: "Do you sell a paid news firehose or Level 2?",
    a: "No. We focus on primary-source filings and public capital events. We do not promise real-time paid-news latency or Level 2 market data.",
  },
  {
    q: "Which markets are covered?",
    a: "US equities where we can map filings and company events to a ticker. Coverage is dynamic and transparent. We do not claim every listing or every source.",
  },
  {
    q: "What if there is no approved case study yet?",
    a: "Case studies appear only after manual approval with source evidence. Until then we do not invent examples or testimonials.",
  },
] as const;

/** Real testimonials only — leave empty rather than invent quotes. */
const REAL_TESTIMONIALS: Array<{
  quote: string;
  attribution: string;
  role?: string;
}> = [];

function SectionHead({
  index,
  label,
  className,
}: {
  index: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`mk-section-rule ${className ?? ""}`}>
      <span className="mk-stat text-[13px] text-[var(--accent)]">{index}</span>
      <span className="mk-tick !text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

function fmtTs(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export interface LandingLatency {
  avgSec: number | null;
  p50Sec?: number | null;
  under3mRate: number | null;
  under30sRate?: number | null;
  sampleSize: number;
  feedCount: number;
  fastestSec?: number | null;
}

export function MarketingLanding({
  displayName,
  isSubscribed = false,
  caseStudy = null,
}: {
  displayName?: string;
  isSubscribed?: boolean;
  caseStudy?: PublicCaseStudy | null;
  /** @deprecated Latency rail removed from primary landing — kept for call-site compat */
  latency?: LandingLatency | null;
  /** @deprecated Catch tape removed from primary landing — kept for call-site compat */
  recentWins?: unknown[];
}) {
  const isSignedIn = !!displayName;
  const primaryHref = isSubscribed
    ? "/dashboard?view=portfolio"
    : "/pricing";
  const primaryLabel = isSubscribed ? "Open Portfolio" : TRUSTTICKER_TRIAL_CTA;
  const secondaryHref = isSubscribed ? "/dashboard?view=watchtower" : "/demo";
  const secondaryLabel = isSubscribed ? "Open Watchtower" : "View Demo";

  return (
    <main className="marketing-shell min-h-screen overflow-x-hidden">
      <LandingScrollSnap />
      <LandingHeroScroll
        displayName={displayName}
        isSignedIn={isSignedIn}
        primaryHref={primaryHref}
        primaryLabel={primaryLabel}
        secondaryHref={secondaryHref}
        secondaryLabel={secondaryLabel}
      />

      <LandingStatsStrip />

      <LandingProductSequence />

      <LandingPinnedOperations />

      <LandingMarketShift />

      <LandingForwardPath primaryHref={primaryHref} isSubscribed={isSubscribed} />
      <section
        id="evidence"
        className="py-12 sm:py-16 px-4 sm:px-6 border-t mk-hairline"
        aria-labelledby="evidence-heading"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead index="05" label="Evidence" className="mb-10 sm:mb-12" />
          </Reveal>
          <Reveal>
            <h2
              id="evidence-heading"
              className="mk-display text-2xl sm:text-4xl mb-3 max-w-xl"
            >
              Auditable examples only.
            </h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-lg leading-relaxed mb-8">
              We publish case studies after manual approval with source evidence.
              No fabricated testimonials. No unsupported performance claims.
            </p>
          </Reveal>

          {caseStudy ? (
            <Reveal delay={80}>
              <article
                className="mk-corners border mk-hairline bg-[var(--bg-graphite)]/50 p-5 sm:p-8 max-w-3xl"
                data-testid="landing-case-study"
              >
                <div className="flex flex-wrap items-baseline gap-2 mb-3">
                  <span className="font-mono font-bold text-emerald-400 text-lg">
                    {caseStudy.symbol}
                  </span>
                  {caseStudy.catalystType && (
                    <span className="mk-tick">{caseStudy.catalystType}</span>
                  )}
                  <span className="mk-tick ml-auto">{caseStudy.checkpointLabel}</span>
                </div>
                <h3 className="text-base sm:text-lg text-[var(--text-primary)] mb-3 leading-snug">
                  {caseStudy.headline}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                  {caseStudy.whatHappened}
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] font-mono text-[var(--text-tertiary)] mb-4">
                  <div>
                    <dt className="mk-tick mb-1">Published</dt>
                    <dd className="text-[var(--text-secondary)]">
                      {fmtTs(caseStudy.publishedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="mk-tick mb-1">Source</dt>
                    <dd className="text-[var(--text-secondary)]">{caseStudy.source}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-4 items-center">
                  {caseStudy.sourceUrl && (
                    <TrackLink
                      event="landing_case_study_click"
                      props={{ placement: "case", kind: caseStudy.kind }}
                      href={caseStudy.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-sky-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                    >
                      Open source evidence →
                    </TrackLink>
                  )}
                  <TrackLink
                    event="landing_case_study_click"
                    props={{ placement: "case_more", kind: caseStudy.kind }}
                    href="/case-studies"
                    className="text-[13px] text-[var(--text-secondary)] hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                  >
                    More case studies →
                  </TrackLink>
                </div>
              </article>
            </Reveal>
          ) : (
            <Reveal delay={80}>
              <div
                className="border mk-hairline rounded-[var(--radius-panel)] p-5 sm:p-8 max-w-3xl bg-[var(--bg-panel)]"
                data-testid="landing-evidence-empty"
              >
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                  No approved case study is published yet. Public audit pages remain
                  available when you want measured history. We do not invent
                  examples here.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/case-studies"
                    className="text-[13px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                  >
                    Case studies →
                  </Link>
                  <Link
                    href="/wins"
                    className="text-[13px] text-[var(--text-secondary)] hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                  >
                    Measured wins archive →
                  </Link>
                  <Link
                    href="/demo"
                    className="text-[13px] text-[var(--text-secondary)] hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                  >
                    View Demo →
                  </Link>
                </div>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ═══ TESTIMONIALS (real only) ═══ */}
      {REAL_TESTIMONIALS.length > 0 && (
        <section
          id="testimonials"
          className="py-14 sm:py-20 px-4 sm:px-6"
          aria-labelledby="testimonials-heading"
        >
          <div className="max-w-6xl mx-auto">
            <SectionHead index="04" label="From investors" className="mb-10" />
            <h2 id="testimonials-heading" className="sr-only">
              Testimonials
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {REAL_TESTIMONIALS.map((t) => (
                <blockquote
                  key={t.attribution}
                  className="border-l border-[var(--border-strong)] pl-5"
                >
                  <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                    “{t.quote}”
                  </p>
                  <footer className="mk-tick">
                    {t.attribution}
                    {t.role ? ` · ${t.role}` : ""}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ PRICING ═══ */}
      <section
        id="pricing"
        className="py-12 sm:py-16 px-4 sm:px-6 border-t mk-hairline"
        aria-labelledby="pricing-heading"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead
              index={REAL_TESTIMONIALS.length > 0 ? "07" : "06"}
              label="Pricing"
              className="mb-10 sm:mb-12"
            />
          </Reveal>
          <Reveal>
            <div className="max-w-xl">
              <h2
                id="pricing-heading"
                className="mk-display text-2xl sm:text-3xl mb-2"
              >
                One product. Full monitoring.
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md">
                {TRUSTTICKER_MONTHLY_LABEL}/month or {TRUSTTICKER_ANNUAL_LABEL} after
                trial. Full platform: Watchtower, Thesis, What Changed, Capital
                Risk, Portfolio Brief, Research, and Discover.
              </p>
              {isSubscribed ? (
                <TrackLink
                  event="landing_cta_trial"
                  props={{ placement: "pricing" }}
                  href="/dashboard"
                  className="block max-w-md"
                >
                  <Button size="lg" className="w-full cta-glow">
                    Open Portfolio
                    <ArrowRight className="w-5 h-5" aria-hidden />
                  </Button>
                </TrackLink>
              ) : (
                <PricingPlanCards
                  trialAvailable
                  isLoggedIn={isSignedIn}
                  loginHref="/login?register=true&next=/pricing"
                />
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FAQ + RISK ═══ */}
      <section
        id="faq"
        className="py-12 sm:py-16 px-4 sm:px-6 border-t mk-hairline"
        aria-labelledby="faq-heading"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead
              index={REAL_TESTIMONIALS.length > 0 ? "07" : "06"}
              label="FAQ & risk"
              className="mb-10 sm:mb-12"
            />
          </Reveal>
          <Reveal className="mb-8">
            <h2 id="faq-heading" className="mk-display text-2xl sm:text-4xl mb-2">
              Questions before you start
            </h2>
          </Reveal>
          <div className="max-w-2xl space-y-2">
            {FAQ.map((item, i) => (
              <Reveal key={item.q} delay={i * 40}>
                <details className="group border-b mk-hairline py-4">
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-[15px] font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded">
                    <span>{item.q}</span>
                    <span
                      className="mk-tick shrink-0 mt-1 group-open:rotate-45 transition-transform"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed pr-8">
                    {item.a}
                  </p>
                </details>
              </Reveal>
            ))}
          </div>

          <Reveal delay={100} className="mt-12 max-w-2xl">
            <div className="flex items-start gap-3 border mk-hairline rounded-[var(--radius-panel)] p-5 bg-amber-500/[0.04]">
              <ShieldCheck
                className="w-5 h-5 text-amber-400 shrink-0 mt-0.5"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold text-sm mb-2 text-amber-200/90">
                  Risk disclosure
                </h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
                  Investing involves substantial risk of loss. TrustTicker does not
                  provide investment, tax, or legal advice. Classifications and alerts
                  can be wrong, delayed, or incomplete. Always verify with primary
                  sources before acting.
                </p>
                <Link
                  href="/legal/disclaimer"
                  className="text-[12px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                >
                  Read the full disclaimer →
                </Link>
              </div>
            </div>
          </Reveal>

          {!isSubscribed && (
            <Reveal delay={120} className="mt-10">
              <div
                className="flex flex-col sm:flex-row sm:items-center gap-3"
                data-testid="landing-footer-ctas"
              >
                <TrackLink
                  event="landing_cta_trial"
                  props={{ placement: "faq_footer" }}
                  href="/pricing"
                >
                  <Button size="lg" className="cta-glow w-full sm:w-auto">
                    {TRUSTTICKER_TRIAL_CTA}
                    <ArrowRight className="w-5 h-5" aria-hidden />
                  </Button>
                </TrackLink>
                <TrackLink
                  event="landing_cta_replay"
                  props={{ placement: "faq_footer" }}
                  href="/demo"
                >
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    View Demo
                  </Button>
                </TrackLink>
              </div>
              <p className="mk-tick mt-4 normal-case !tracking-[0.06em]">
                {TRUSTTICKER_MONTHLY_MO} or {TRUSTTICKER_ANNUAL_LABEL} after trial
              </p>
            </Reveal>
          )}
        </div>
      </section>

      <footer className="border-t mk-hairline py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <DisclaimerBanner compact />
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
            <span className="mk-tick flex items-center gap-2 normal-case !tracking-normal !text-[var(--text-tertiary)]">
              © {new Date().getFullYear()} TrustTicker. All rights reserved.
            </span>
            <nav
              className="flex flex-wrap justify-center gap-5 sm:gap-6"
              aria-label="Legal"
            >
              {[
                { href: "/legal/terms", label: "Terms" },
                { href: "/legal/privacy", label: "Privacy" },
                { href: "/legal/cookies", label: "Cookies" },
                { href: "/legal/disclaimer", label: "Disclaimer" },
                { href: "/case-studies", label: "Case studies" },
                { href: "/wins", label: "Wins archive" },
                { href: "/demo", label: "Demo" },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="mk-tick hover:!text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </main>
  );
}

/** FAQ items for JSON-LD — must match displayed FAQ. */
export const LANDING_FAQ_FOR_SCHEMA = FAQ;
