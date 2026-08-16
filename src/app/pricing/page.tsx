import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ArrowLeft, Zap, ShieldAlert, Gauge, Bell, Target, Briefcase } from "lucide-react";
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
import { evaluateTrialEligibility } from "@/lib/trial";
import {
  TRUSTTICKER_MONTHLY_PRICE,
  TRUSTTICKER_MONTHLY_MO,
  TRUSTTICKER_ANNUAL_LABEL,
  TRUSTTICKER_ANNUAL_PER_MO_LABEL,
  TRUSTTICKER_ANNUAL_SAVE_USD,
} from "@/lib/billing/pricing";

const pillars = [
  { icon: Briefcase, title: "Portfolio", body: "Watch your holdings for material changes" },
  { icon: Target, title: "Watchtower", body: "What Changed across your names" },
  { icon: Gauge, title: "Research", body: "Filings, capital risk, insider context" },
  { icon: ShieldAlert, title: "Discover", body: "Opportunity rules — informational only" },
];

const included = [
  "Full Investor OS during trial or paid access",
  "Portfolio monitoring & high-signal alerts",
  "SEC event detection & dilution / capital risk",
  "Monthly and annual unlock identical features",
  "Informational only — not investment advice",
  "Cancel anytime",
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
        trialConsumedAt: true,
        phoneNumber: true,
        email: true,
      },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
    const claimUsed = await hasTrialClaim({
      email: user?.email,
      phoneNumber: user?.phoneNumber,
    });
    trialAvailable = evaluateTrialEligibility({
      user: user ?? undefined,
      durableClaimExists: claimUsed,
    }).eligible;
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
        <span className="mk-tick hidden sm:inline">
          {TRUSTTICKER_MONTHLY_MO} · {TRUSTTICKER_ANNUAL_LABEL} · cancel anytime
        </span>
      </header>

      <main className="relative flex-1 px-4 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 price-rise">
            <p className="mk-tick !text-emerald-400 mb-4">Pricing</p>
            <h1 className="mk-display text-3xl sm:text-[2.75rem] mb-3">
              One product. Full access.
            </h1>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              TrustTicker monitors your investments for material changes. Monthly and annual
              unlock the same platform.{" "}
              {trialAvailable
                ? "Eligible accounts get a 7-day trial (card collected at checkout; not charged until trial ends)."
                : "Subscribe to continue after your trial."}
            </p>
          </div>

          {params.canceled === "true" && (
            <div className="mb-8 max-w-lg mx-auto border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. Start whenever you&apos;re ready.
            </div>
          )}

          <div
            className="mk-lift relative mk-panel p-6 sm:p-8 flex flex-col !border-emerald-500/40 bg-emerald-500/[0.04] mb-8 price-rise"
            style={{ animationDelay: "0.08s" }}
          >
            <p className="mk-tick !text-emerald-400 mb-3">TrustTicker</p>
            <div className="flex flex-wrap items-end gap-6 mb-2">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="mk-display text-[2.5rem] leading-none">
                    ${TRUSTTICKER_MONTHLY_PRICE}
                  </span>
                  <span className="text-[var(--text-tertiary)]">/mo</span>
                </div>
                <p className="text-[13px] text-emerald-300 font-medium mt-1">
                  or {TRUSTTICKER_ANNUAL_PER_MO_LABEL} billed annually · save ~$
                  {TRUSTTICKER_ANNUAL_SAVE_USD}
                </p>
              </div>
            </div>
            <p className="text-sm text-emerald-400 mb-5">
              {trialAvailable ? "7-day free trial" : "Billed at checkout"}
            </p>
            <ul className="text-[12px] text-[var(--text-secondary)] space-y-2 mb-6">
              {included.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
            {session ? (
              <div className="space-y-2">
                <CheckoutButton
                  size="lg"
                  className="w-full cta-glow"
                  billingPeriod="monthly"
                >
                  {trialAvailable
                    ? "Start free trial — monthly"
                    : `Subscribe — ${TRUSTTICKER_MONTHLY_MO}`}
                </CheckoutButton>
                <CheckoutButton
                  size="sm"
                  className="w-full"
                  showIcon={false}
                  billingPeriod="annual"
                >
                  Annual — {TRUSTTICKER_ANNUAL_LABEL}
                </CheckoutButton>
              </div>
            ) : (
              <Link href="/login?register=true&next=/pricing" className="block">
                <Button size="lg" className="w-full cta-glow">
                  Create account to start
                </Button>
              </Link>
            )}
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mb-10 price-rise"
            style={{ animationDelay: "0.16s" }}
          >
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              Same features monthly or annual · cancel anytime
            </span>
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Bell className="w-3.5 h-3.5 text-emerald-500" />
              Not investment advice
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            {pillars.map(({ icon: Icon, title, body }) => (
              <div key={title} className="mk-panel p-4 flex gap-3">
                <Icon className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
                  <p className="text-[12px] text-[var(--text-tertiary)]">{body}</p>
                </div>
              </div>
            ))}
          </div>

          <LiveProofStrip />
          <div className="mt-8">
            <DisclaimerBanner />
          </div>
        </div>
      </main>
    </div>
  );
}
