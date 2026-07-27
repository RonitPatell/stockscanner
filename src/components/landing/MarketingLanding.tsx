import Link from "next/link";
import {
  ArrowRight,
  Check,
  ShieldAlert,
  ShieldCheck,
  Bell,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Reveal } from "./Reveal";
import { HeroProductStage, HeroProofRail, type WireWin } from "./HeroProductStage";
import { TrackLink } from "./TrackLink";
import { SUBSCRIPTION_PRICE_LABEL } from "@/lib/stripe";
import type { PublicCaseStudy } from "@/lib/calibration/service";

const BENEFITS = [
  {
    icon: Search,
    title: "Verify the catalyst",
    body: "We match US equity headlines to tickers with confidence scoring, source context, and publish timestamps you can audit.",
  },
  {
    icon: ShieldAlert,
    title: "Detect the trap",
    body: "Dilution, offerings, and low-quality news are flagged with evidence links so you don’t chase a move that was never yours.",
  },
  {
    icon: Bell,
    title: "Receive the alert",
    body: "Watchlist alerts include float and relative-volume context — enough to decide skip vs engage without opening ten tabs.",
  },
] as const;

const FAQ = [
  {
    q: "What does TrustTicker actually do?",
    a: "It verifies US stock catalysts, surfaces dilution and low-quality news risk, and alerts your watchlist with float and relative-volume context.",
  },
  {
    q: "Is this investment advice?",
    a: "No. TrustTicker is an informational market-data and classification tool. You make your own decisions. Past reactions do not guarantee future results.",
  },
  {
    q: "What does the free trial include?",
    a: `A 7-day free trial of Pro. After that, ${SUBSCRIPTION_PRICE_LABEL}/month. Cancel anytime in Settings.`,
  },
  {
    q: "How do you measure latency?",
    a: "We record publisher time and ingest time for catalysts, then publish sample size and distribution on /wins. We do not invent unverified speed claims.",
  },
  {
    q: "Which markets are covered?",
    a: "US equities and related catalyst wires we can map to a ticker. Coverage is dynamic and transparent — not a claim of every listing or every source.",
  },
  {
    q: "What if there is no approved case study yet?",
    a: "Case studies appear only after manual approval with source evidence. Until then we show measured catches and latency stats instead of fabricated examples.",
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
  under3mRate: number | null;
  sampleSize: number;
  feedCount: number;
  fastestSec?: number | null;
}

export function MarketingLanding({
  displayName,
  isSubscribed = false,
  caseStudy = null,
  latency = null,
  recentWins = [],
}: {
  displayName?: string;
  isSubscribed?: boolean;
  caseStudy?: PublicCaseStudy | null;
  latency?: LandingLatency | null;
  recentWins?: WireWin[];
}) {
  const isSignedIn = !!displayName;
  const scannerHref = isSubscribed ? "/dashboard" : "/demo";

  return (
    <div className="marketing-shell min-h-screen overflow-x-hidden">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-[100svh] flex flex-col" aria-labelledby="hero-heading">
        <div className="absolute inset-0 grid-bg opacity-70 pointer-events-none" aria-hidden />
        <div className="mk-glow-top absolute inset-0 pointer-events-none" aria-hidden />

        <div className="relative flex-1 flex items-center max-w-6xl w-full mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-10 sm:pb-12">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_220px] gap-10 lg:gap-16 items-center w-full">
            <div className="max-w-2xl">
              <p className="landing-fade-up mk-tick !text-emerald-400 flex items-center gap-2 mb-6 sm:mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
                US equities · verified catalysts
              </p>

              <h1
                id="hero-heading"
                className="landing-fade-up landing-delay-1 mk-display text-[2.15rem] leading-[1.12] sm:text-5xl lg:text-[3.75rem] mb-5 sm:mb-6 text-[var(--text-primary)]"
              >
                {isSignedIn ? (
                  <>
                    Know why it&apos;s moving
                    <br />
                    <span className="text-[var(--text-tertiary)]">before you chase it.</span>
                  </>
                ) : (
                  <>Know why it&apos;s moving before you chase it.</>
                )}
              </h1>

              <p className="landing-fade-up landing-delay-2 text-[15px] sm:text-base text-[var(--text-secondary)] max-w-xl mb-8 sm:mb-9 leading-[1.65]">
                TrustTicker verifies US stock catalysts, flags dilution and low-quality
                news, and sends watchlist alerts with float and relative-volume context.
                {isSignedIn && displayName ? ` Welcome back, ${displayName}.` : ""}
              </p>

              <div className="landing-fade-up landing-delay-3 flex flex-col min-[390px]:flex-row min-[390px]:items-center gap-3">
                {isSignedIn ? (
                  <>
                    <TrackLink event="landing_cta_replay" props={{ placement: "hero" }} href={scannerHref}>
                      <Button size="lg" className="text-[15px] px-8 w-full min-[390px]:w-auto cta-glow">
                        {isSubscribed ? "Open scanner" : "View real market replay"}
                        <ArrowRight className="w-5 h-5" aria-hidden />
                      </Button>
                    </TrackLink>
                    {!isSubscribed && (
                      <TrackLink event="landing_cta_trial" props={{ placement: "hero" }} href="/pricing">
                        <Button variant="outline" size="lg" className="text-[15px] px-8 w-full min-[390px]:w-auto">
                          Start free trial
                        </Button>
                      </TrackLink>
                    )}
                  </>
                ) : (
                  <>
                    <TrackLink event="landing_cta_replay" props={{ placement: "hero" }} href="/demo">
                      <Button size="lg" className="text-[15px] px-8 w-full min-[390px]:w-auto cta-glow">
                        View real market replay
                        <ArrowRight className="w-5 h-5" aria-hidden />
                      </Button>
                    </TrackLink>
                    <TrackLink event="landing_cta_trial" props={{ placement: "hero" }} href="/pricing">
                      <Button variant="outline" size="lg" className="text-[15px] px-8 w-full min-[390px]:w-auto">
                        Start free trial
                      </Button>
                    </TrackLink>
                  </>
                )}
              </div>

              <p className="landing-fade-up landing-delay-4 mk-tick mt-5 sm:mt-6 text-[var(--text-tertiary)]">
                {SUBSCRIPTION_PRICE_LABEL}/month after trial. Cancel anytime.
              </p>
            </div>

            <div className="hidden lg:block">
              <HeroProofRail initial={latency} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 01 · ONE REAL CASE ═══ */}
      <section id="case-study" className="py-14 sm:py-20 px-4 sm:px-6" aria-labelledby="case-heading">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead index="01" label="Case study" className="mb-10 sm:mb-12" />
          </Reveal>
          <Reveal>
            <h2 id="case-heading" className="mk-display text-2xl sm:text-4xl mb-6 sm:mb-8 max-w-xl">
              One approved example. Source and timestamps included.
            </h2>
          </Reveal>

          {caseStudy ? (
            <Reveal delay={80}>
              <article className="mk-corners border mk-hairline bg-[var(--bg-graphite)]/50 p-5 sm:p-8 max-w-3xl">
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
                    <dd className="text-[var(--text-secondary)]">{fmtTs(caseStudy.publishedAt)}</dd>
                  </div>
                  <div>
                    <dt className="mk-tick mb-1">Source</dt>
                    <dd className="text-[var(--text-secondary)]">{caseStudy.source}</dd>
                  </div>
                  {caseStudy.priceAtIngest != null && (
                    <div>
                      <dt className="mk-tick mb-1">Price @ ingest</dt>
                      <dd className="text-[var(--text-secondary)]">
                        ${caseStudy.priceAtIngest.toFixed(2)}
                      </dd>
                    </div>
                  )}
                  {caseStudy.rawReturnPct != null && (
                    <div>
                      <dt className="mk-tick mb-1">Observed reaction</dt>
                      <dd
                        className={
                          caseStudy.rawReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {caseStudy.rawReturnPct >= 0 ? "+" : ""}
                        {caseStudy.rawReturnPct.toFixed(2)}%
                      </dd>
                    </div>
                  )}
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
              <div className="border mk-hairline rounded-[var(--radius-panel)] p-5 sm:p-8 max-w-3xl bg-[var(--bg-panel)]">
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                  No approved case study is published yet. We only show manually approved,
                  auditable examples with source evidence — never fictional tickers.
                </p>
                <TrackLink
                  event="landing_case_study_click"
                  props={{ placement: "case_empty" }}
                  href="/wins"
                  className="text-[13px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                >
                  Review measured speed wins instead →
                </TrackLink>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ═══ 02 · THREE BENEFITS ═══ */}
      <section id="benefits" className="py-14 sm:py-20 px-4 sm:px-6" aria-labelledby="benefits-heading">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead index="02" label="How it helps" className="mb-10 sm:mb-12" />
          </Reveal>
          <Reveal className="max-w-2xl mb-10 sm:mb-14">
            <h2 id="benefits-heading" className="mk-display text-2xl sm:text-4xl mb-3">
              Three jobs. No feature dump.
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-8 md:gap-10">
            {BENEFITS.map((b, i) => (
              <Reveal key={b.title} delay={i * 80} as="article">
                <div className="border-t border-[var(--border-medium)] pt-6 h-full">
                  <b.icon
                    className="w-5 h-5 text-emerald-400 mb-4"
                    aria-hidden
                  />
                  <h3 className="font-semibold text-lg tracking-tight mb-2.5">{b.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{b.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 03 · COVERAGE & LATENCY ═══ */}
      <section
        id="coverage"
        className="py-14 sm:py-20 px-4 sm:px-6 bg-[var(--bg-graphite)]/40 border-y mk-hairline"
        aria-labelledby="coverage-heading"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead index="03" label="Coverage & latency" className="mb-10 sm:mb-12" />
          </Reveal>
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
            <Reveal className="lg:col-span-5">
              <h2 id="coverage-heading" className="mk-display text-2xl sm:text-4xl mb-4">
                Transparent numbers. Auditable samples.
              </h2>
              <p className="text-[var(--text-secondary)] leading-[1.7] mb-5 text-sm sm:text-[15px]">
                Latency is measured from publisher time to ingest time. We show sample size
                and rates — not unverified “instant” claims. Coverage is US catalysts we can
                map to a ticker with confidence.
              </p>
              <Link
                href="/wins"
                className="mk-tick !text-emerald-400 hover:!text-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
              >
                Open the public audit →
              </Link>
            </Reveal>
            <Reveal delay={100} className="lg:col-span-7">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                {[
                  {
                    label: "Avg ingest",
                    value:
                      latency?.avgSec != null
                        ? latency.avgSec >= 120
                          ? `${Math.round(latency.avgSec / 60)}m`
                          : `${Math.round(latency.avgSec)}s`
                        : "—",
                  },
                  {
                    label: "Under 3 min",
                    value:
                      latency?.under3mRate != null ? `${latency.under3mRate}%` : "—",
                  },
                  {
                    label: "24h sample",
                    value: latency?.sampleSize ? String(latency.sampleSize) : "—",
                  },
                  {
                    label: "In feed",
                    value: latency?.feedCount ? String(latency.feedCount) : "—",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="border mk-hairline rounded-[var(--radius-panel)] p-4 bg-[var(--bg-panel)]"
                  >
                    <p className="mk-stat text-xl sm:text-2xl text-[var(--text-primary)]">
                      {s.value}
                    </p>
                    <p className="mk-tick mt-2">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[var(--text-muted)] mt-4 leading-relaxed">
                Stats refresh from live measured catches. Low samples are provisional — we
                prefer honesty over marketing theater.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ 04 · PRODUCT REPLAY ═══ */}
      <section id="product" className="pt-14 sm:pt-20" aria-labelledby="product-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mb-8 sm:mb-10">
          <Reveal>
            <SectionHead index="04" label="Product" className="mb-8" />
          </Reveal>
          <Reveal>
            <h2 id="product-heading" className="mk-display text-2xl sm:text-4xl mb-3 max-w-xl">
              Interactive replay of real catches
            </h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-lg leading-relaxed mb-4">
              Rows below come from measured catalysts — not a mock ticker tape. Open the
              evidence demo for a guided walkthrough.
            </p>
            <TrackLink event="landing_cta_replay" props={{ placement: "product" }} href="/demo">
              <span className="text-[13px] text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded inline-flex items-center gap-1">
                View real market replay <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </span>
            </TrackLink>
          </Reveal>
        </div>
        <HeroProductStage initialWins={recentWins} />
      </section>

      {/* ═══ 05 · TESTIMONIALS (real only) ═══ */}
      {REAL_TESTIMONIALS.length > 0 && (
        <section
          id="testimonials"
          className="py-14 sm:py-20 px-4 sm:px-6"
          aria-labelledby="testimonials-heading"
        >
          <div className="max-w-6xl mx-auto">
            <SectionHead index="05" label="From traders" className="mb-10" />
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

      {/* ═══ 06 · PRICING ═══ */}
      <section
        id="pricing"
        className="py-14 sm:py-20 px-4 sm:px-6"
        aria-labelledby="pricing-heading"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <SectionHead
              index={REAL_TESTIMONIALS.length > 0 ? "06" : "05"}
              label="Pricing"
              className="mb-10 sm:mb-12"
            />
          </Reveal>
          <Reveal>
            <div className="max-w-md border mk-hairline rounded-[var(--radius-panel)] p-6 sm:p-8 bg-[var(--bg-panel)]">
              <h2 id="pricing-heading" className="mk-display text-2xl sm:text-3xl mb-2">
                Pro
              </h2>
              <p className="mk-stat text-3xl text-[var(--text-primary)] mb-1">
                {SUBSCRIPTION_PRICE_LABEL}
                <span className="text-base font-sans font-normal text-[var(--text-tertiary)]">
                  /month
                </span>
              </p>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                7-day free trial. Cancel anytime.
              </p>
              <ul className="space-y-2.5 mb-8">
                {[
                  "Verified catalyst feed with source links",
                  "Dilution and low-quality news flags",
                  "Watchlist alerts with float & RVol context",
                  "Measured latency you can audit",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <TrackLink
                event="landing_cta_trial"
                props={{ placement: "pricing" }}
                href={isSubscribed ? "/dashboard" : "/pricing"}
                className="block"
              >
                <Button size="lg" className="w-full cta-glow">
                  {isSubscribed ? "Open scanner" : "Start free trial"}
                  <ArrowRight className="w-5 h-5" aria-hidden />
                </Button>
              </TrackLink>
              <p className="mk-tick mt-4 text-center">
                Full plans and annual billing on the{" "}
                <Link
                  href="/pricing"
                  className="!text-emerald-400 hover:!text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded"
                >
                  pricing page
                </Link>
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FAQ + RISK ═══ */}
      <section
        id="faq"
        className="py-14 sm:py-20 px-4 sm:px-6 border-t mk-hairline"
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
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden />
              <div>
                <h3 className="font-semibold text-sm mb-2 text-amber-200/90">Risk disclosure</h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-3">
                  Trading involves substantial risk of loss. TrustTicker does not provide
                  investment, tax, or legal advice. Classifications and alerts can be wrong,
                  delayed, or incomplete. Always verify with primary sources before acting.
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
        </div>
      </section>

      <footer className="border-t mk-hairline py-10 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <DisclaimerBanner compact />
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
            <span className="mk-tick flex items-center gap-2 normal-case !tracking-normal !text-[var(--text-tertiary)]">
              © {new Date().getFullYear()} TrustTicker. All rights reserved.
            </span>
            <nav className="flex flex-wrap justify-center gap-5 sm:gap-6" aria-label="Legal">
              {[
                { href: "/legal/terms", label: "Terms" },
                { href: "/legal/privacy", label: "Privacy" },
                { href: "/legal/cookies", label: "Cookies" },
                { href: "/legal/disclaimer", label: "Disclaimer" },
                { href: "/case-studies", label: "Case studies" },
                { href: "/wins", label: "Speed wins" },
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
    </div>
  );
}

/** FAQ items for JSON-LD — must match displayed FAQ. */
export const LANDING_FAQ_FOR_SCHEMA = FAQ;
