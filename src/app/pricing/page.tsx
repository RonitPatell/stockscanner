import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Check,
  ArrowLeft,
  Zap,
  ShieldAlert,
  Gauge,
  Megaphone,
  FlaskConical,
  Keyboard,
  Bell,
  Target,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/CheckoutButton";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { LiveProofStrip } from "@/components/LiveProofStrip";
import { LogoMark } from "@/components/Logo";
import { FunnelViewBeacon } from "@/components/FunnelViewBeacon";
import { hasTrialClaim } from "@/lib/trial-claims";
import {
  SUBSCRIPTION_PRICE,
  SUBSCRIPTION_PRICE_MO,
  SUBSCRIPTION_ANNUAL_LABEL,
  SUBSCRIPTION_ANNUAL_SAVE,
  SUBSCRIPTION_ANNUAL_SAVE_USD,
  SUBSCRIPTION_ANNUAL_PER_MO_LABEL,
  SUBSCRIPTION_ANNUAL_PRICE,
} from "@/lib/stripe";

const pillars = [
  { icon: Gauge, title: "Speed", body: "Wire ingest + SSE push, auditable on /wins" },
  { icon: Target, title: "Judgment", body: "Playbooks, anti-FOMO, dilution radar" },
  { icon: FlaskConical, title: "Proof", body: "Measured latency + candle comparisons" },
  { icon: Megaphone, title: "Desk", body: "Call board, Prop Desk, hotkeys, session plan" },
];

const included = [
  {
    group: "Speed & feed",
    icon: Gauge,
    items: [
      "Measured ingest latency varies; Pro pushes via SSE when the feed updates — speed depends on source + worker",
      "Stock-impact headlines only — noise filtered at ingest",
      "Story clustering across duplicate wires",
      "Source trust tiers + verified confidence",
      "Public speed wins page — publish → feed proof",
      "Live trust bar — freshness & ingest latency",
    ],
  },
  {
    group: "Judgment stack",
    icon: ShieldAlert,
    items: [
      "Action playbooks: Long / Short / Watch / Skip + invalidation",
      "Anti-FOMO scoring on every expanded catalyst",
      "Dilution radar for offerings & ATM traps",
      "Session plan (3 setups / 2 skips) + watchlist autopsy",
      "Sympathy map + 12h catalyst replay",
      "Rules-based impact score, setup tags, float / RVol / historical context",
    ],
  },
  {
    group: "Proof & ROI",
    icon: FlaskConical,
    items: [
      "Illustrative speed scenarios — ingest vs +3m on $1k notional",
      "Verified 1-minute candle speed backtests when available",
      "Paper trade stamps on catalysts",
      "Morning + EOD email briefs with Daily Edge Recap",
      "Cancel anytime — no contracts",
    ],
  },
  {
    group: "Desk & alerts",
    icon: Keyboard,
    items: [
      "Prop Desk (/desk) focused trading layout",
      "Shared call board — who called it first",
      "Trader hotkeys (j/k, Enter, w, 1/2/3, /)",
      "Pro alert rules: HOD, float, RVol, urgency",
      "Discord, email, SMS, and browser push",
      "Chrome overlay (install from Settings)",
      "Premarket command center + market state panel",
    ],
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  let isSubscribed = false;
  let trialAvailable = true;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        hasUsedTrial: true,
        phoneNumber: true,
        email: true,
      },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
    if (user?.hasUsedTrial) {
      trialAvailable = false;
    } else {
      const claimUsed = await hasTrialClaim({
        email: user?.email,
        phoneNumber: user?.phoneNumber,
      });
      trialAvailable = !claimUsed;
    }
  }

  if (isSubscribed) {
    redirect("/dashboard");
  }

  return (
    <div className="marketing-shell min-h-screen flex flex-col relative overflow-hidden">
      <FunnelViewBeacon event="pricing_view" />
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
      <div className="mk-glow-top absolute inset-x-0 top-0 h-[50vh] pointer-events-none" />

      <header className="relative border-b mk-hairline px-4 sm:px-6 h-16 flex items-center justify-between backdrop-blur-xl bg-black/40 z-10">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <LogoMark className="w-7 h-7" />
            <span className="font-semibold tracking-tight">
              Trust<span className="text-emerald-400">Ticker</span>
            </span>
          </div>
        </Link>
        <span className="mk-tick hidden sm:inline">One plan · cancel anytime</span>
      </header>

      <main className="relative flex-1 px-4 py-10 sm:py-14">
        <div className="max-w-5xl mx-auto">
          {/* Compact head — plans stay above the fold */}
          <div className="text-center mb-8 sm:mb-10 price-rise">
            <p className="mk-tick !text-emerald-400 mb-4">Pricing</p>
            <h1 className="mk-display text-3xl sm:text-[2.75rem] mb-3">
              One plan. The whole judgment stack.
            </h1>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              Free gets you the habit. Pro gets you the live desk.
            </p>
          </div>

          {params.canceled === "true" && (
            <div className="mb-8 max-w-lg mx-auto border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. Start your trial whenever you&apos;re ready.
            </div>
          )}

          {/* Plan cards — the one decision on this page */}
          <div
            className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-5 price-rise"
            style={{ animationDelay: "0.08s" }}
          >
            {/* Monthly */}
            <div className="mk-lift mk-panel mk-corners p-6 sm:p-7 flex flex-col">
              <div className="mb-5">
                <p className="mk-tick mb-3">Pro Monthly</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="mk-display text-[2.75rem] leading-none">
                    ${SUBSCRIPTION_PRICE}
                  </span>
                  <span className="text-[var(--text-tertiary)]">/mo</span>
                </div>
                <p className="text-[13px] text-[var(--text-tertiary)] mt-2">
                  Flexible · cancel anytime · ${Math.round(SUBSCRIPTION_PRICE * 12)}/yr if you stay
                </p>
              </div>
              <p className="text-sm text-emerald-400 mb-5">
                {trialAvailable
                  ? "7-day free trial included"
                  : "No trial — billed immediately at checkout"}
              </p>
              <div className="mt-auto">
                {session ? (
                  <CheckoutButton size="lg" className="w-full text-base" plan="monthly">
                    {trialAvailable ? "Start free trial" : `Subscribe — ${SUBSCRIPTION_PRICE_MO}`}
                  </CheckoutButton>
                ) : (
                  <Link href="/login?register=true&next=checkout" className="block">
                    <Button size="lg" variant="secondary" className="w-full text-base">
                      Create account &amp; start trial
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Annual — recommended */}
            <div className="mk-lift relative mk-panel p-6 sm:p-7 flex flex-col !border-emerald-500/40 bg-emerald-500/[0.04] shadow-[0_0_60px_-24px_rgba(22,199,132,0.4)]">
              <div className="absolute -top-px right-6 bg-emerald-500 text-black text-[10px] font-mono font-bold px-3 py-1 tracking-[0.14em]">
                BEST VALUE
              </div>
              <div className="mb-5">
                <p className="mk-tick !text-emerald-400 mb-3">Pro Annual</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="mk-display text-[2.75rem] leading-none">
                    ${SUBSCRIPTION_ANNUAL_PRICE}
                  </span>
                  <span className="text-[var(--text-tertiary)]">/yr</span>
                </div>
                <p className="text-[13px] text-emerald-300 font-medium mt-2">
                  {SUBSCRIPTION_ANNUAL_PER_MO_LABEL} effective · {SUBSCRIPTION_ANNUAL_SAVE}
                </p>
                <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
                  You keep ~${SUBSCRIPTION_ANNUAL_SAVE_USD} vs monthly (about{" "}
                  {Math.round(SUBSCRIPTION_ANNUAL_SAVE_USD / SUBSCRIPTION_PRICE)} months free)
                </p>
              </div>
              <p className="text-sm text-emerald-400 mb-5">
                {trialAvailable
                  ? "7-day free trial, then billed annually"
                  : "Billed annually at checkout"}
              </p>
              <div className="mt-auto">
                {session ? (
                  <CheckoutButton size="lg" className="w-full text-base cta-glow" plan="annual">
                    Lock annual — {SUBSCRIPTION_ANNUAL_LABEL}
                  </CheckoutButton>
                ) : (
                  <Link href="/login?register=true&next=checkout" className="block">
                    <Button size="lg" className="w-full text-base cta-glow">
                      Create account &amp; lock annual
                    </Button>
                  </Link>
                )}
                <p className="text-[11px] text-[var(--text-tertiary)] mt-3 text-center">
                  Same features as monthly — just a lower effective rate
                </p>
              </div>
            </div>
          </div>

          {/* Trust line, right under the ask */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mb-4 price-rise"
            style={{ animationDelay: "0.16s" }}
          >
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              See → Skip → Prove · cancel anytime
            </span>
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Bell className="w-3.5 h-3.5 text-emerald-500" />
              Discord · email · SMS · push · Chrome overlay
            </span>
          </div>
          {!session && (
            <p className="text-center text-sm text-[var(--text-tertiary)] mb-10">
              Already have an account?{" "}
              <Link
                href="/login?next=checkout"
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Sign in
              </Link>
            </p>
          )}

          {/* Live measured proof, adjacent to the conversion decision */}
          <div className="max-w-3xl mx-auto mb-12 price-rise" style={{ animationDelay: "0.22s" }}>
            <LiveProofStrip compact />
          </div>

          {/* Four pillars — slim ledger strip */}
          <div
            className="mk-corners grid grid-cols-2 lg:grid-cols-4 border-t border-l mk-hairline mb-14 price-rise"
            style={{ animationDelay: "0.28s" }}
          >
            {pillars.map((p) => (
              <div key={p.title} className="border-b border-r mk-hairline p-5">
                <p.icon className="w-4.5 h-4.5 text-emerald-500/90 mb-2.5" />
                <p className="font-semibold text-sm tracking-tight mb-1">{p.title}</p>
                <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          {/* Everything included */}
          <div className="mb-12 price-rise" style={{ animationDelay: "0.34s" }}>
            <h2 className="mk-display text-xl sm:text-2xl mb-8 text-center">
              Everything in Pro
            </h2>
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-10">
              {included.map((section) => (
                <div key={section.group}>
                  <h3 className="mk-tick !text-emerald-400/90 mb-4 flex items-center gap-2">
                    <section.icon className="w-4 h-4" />
                    {section.group}
                  </h3>
                  <ul className="space-y-2.5">
                    {section.items.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-sm text-[var(--text-secondary)]"
                      >
                        <Check className="w-4 h-4 text-emerald-500/80 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Free tier + explore */}
          <div className="max-w-2xl mx-auto text-center border-t mk-hairline pt-10">
            <p className="text-sm text-[var(--text-tertiary)] mb-2">
              Not ready? The free tier has a public daily plan, demo scanner, and the
              speed-wins proof page.
            </p>
            <p className="text-sm mb-8">
              {[
                { href: "/today", label: "Today's free plan" },
                { href: "/demo", label: "Evidence demo" },
                { href: "/wins", label: "Speed wins" },
              ].map((l, i) => (
                <span key={l.href}>
                  {i > 0 && <span className="text-[var(--text-muted)]"> · </span>}
                  <Link
                    href={l.href}
                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {l.label}
                  </Link>
                </span>
              ))}
            </p>
            <DisclaimerBanner compact />
          </div>
        </div>
      </main>
    </div>
  );
}
