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
  Bell,
  Target,
  Briefcase,
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
import { evaluateTrialEligibility } from "@/lib/trial";
import {
  PLUS_PRICE,
  PLUS_PRICE_MO,
  PLUS_ANNUAL_PRICE,
  PLUS_ANNUAL_LABEL,
  PRO_PRICE,
  PRO_PRICE_MO,
  PRO_ANNUAL_PRICE,
  PRO_ANNUAL_LABEL,
  PRO_ANNUAL_PER_MO_LABEL,
  PRO_ANNUAL_SAVE_USD,
} from "@/lib/stripe";

const pillars = [
  {
    icon: Briefcase,
    title: "Portfolio",
    body: "Free front door for every investor style",
  },
  {
    icon: Target,
    title: "Research",
    body: "Ticker hubs with filings, Form 4, EDGAR links",
  },
  {
    icon: Gauge,
    title: "Markets",
    body: "Pro Floor: movers, wire, live context",
  },
  {
    icon: ShieldAlert,
    title: "Structure",
    body: "Pro dilution and offering risk desk",
  },
];

const included = [
  {
    group: "Free",
    icon: Briefcase,
    items: [
      "Portfolio / watchlist (up to 15 symbols)",
      "Public ticker hubs",
      "Basic catalyst history on /ticker",
      "EDGAR search links",
    ],
  },
  {
    group: "Plus",
    icon: Bell,
    items: [
      "Unlimited watchlist",
      "Price and filing-oriented alerts",
      "Deeper research on your names",
      "Email / push when configured",
    ],
  },
  {
    group: "Pro",
    icon: ShieldAlert,
    items: [
      "Everything in Plus",
      "Structure Desk + Dilution Radar",
      "Markets Floor (movers + wire)",
      "Session plan, call board, Prop Desk tools",
    ],
  },
  {
    group: "Always",
    icon: FlaskConical,
    items: [
      "No paid news license required",
      "Informational only, not advice",
      "Cancel anytime",
      "Soft infra: scale spend after revenue",
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
          Free · Plus · Pro · cancel anytime
        </span>
      </header>

      <main className="relative flex-1 px-4 py-10 sm:py-14">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-10 price-rise">
            <p className="mk-tick !text-emerald-400 mb-4">Pricing</p>
            <h1 className="mk-display text-3xl sm:text-[2.75rem] mb-3">
              Investor OS. Three tiers.
            </h1>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              Free for Portfolio. Plus for alerts. Pro for Structure and Markets.
            </p>
          </div>

          {params.canceled === "true" && (
            <div className="mb-8 max-w-lg mx-auto border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. Start whenever you&apos;re ready.
            </div>
          )}

          <div
            className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto mb-8 price-rise"
            style={{ animationDelay: "0.08s" }}
          >
            <div className="mk-lift mk-panel mk-corners p-6 flex flex-col">
              <p className="mk-tick mb-3">Free</p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="mk-display text-[2.5rem] leading-none">$0</span>
              </div>
              <p className="text-[13px] text-[var(--text-tertiary)] mb-5">
                Portfolio up to 15 symbols · ticker hubs
              </p>
              <ul className="text-[12px] text-[var(--text-secondary)] space-y-2 mb-6 flex-1">
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  Watchlist + Research entry
                </li>
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  Public /ticker hubs
                </li>
              </ul>
              <Link href={session ? "/dashboard" : "/login?register=true&next=/dashboard"}>
                <Button size="lg" variant="secondary" className="w-full">
                  {session ? "Open Portfolio" : "Create free account"}
                </Button>
              </Link>
            </div>

            <div className="mk-lift mk-panel mk-corners p-6 flex flex-col !border-sky-500/30">
              <p className="mk-tick !text-sky-400 mb-3">Plus</p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="mk-display text-[2.5rem] leading-none">
                  ${PLUS_PRICE}
                </span>
                <span className="text-[var(--text-tertiary)]">/mo</span>
              </div>
              <p className="text-[13px] text-[var(--text-tertiary)] mb-1">
                or ${PLUS_ANNUAL_PRICE}/yr ({PLUS_ANNUAL_LABEL})
              </p>
              <p className="text-sm text-sky-400 mb-5">
                {trialAvailable ? "7-day free trial" : "Billed at checkout"}
              </p>
              <ul className="text-[12px] text-[var(--text-secondary)] space-y-2 mb-6 flex-1">
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  Unlimited watchlist
                </li>
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  Alerts on your names
                </li>
              </ul>
              {session ? (
                <CheckoutButton
                  size="lg"
                  className="w-full"
                  tier="plus"
                  plan="monthly"
                >
                  {trialAvailable ? "Start Plus trial" : `Subscribe — ${PLUS_PRICE_MO}`}
                </CheckoutButton>
              ) : (
                <Link href="/login?register=true&next=checkout" className="block">
                  <Button size="lg" variant="secondary" className="w-full">
                    Create account for Plus
                  </Button>
                </Link>
              )}
            </div>

            <div className="mk-lift relative mk-panel p-6 flex flex-col !border-emerald-500/40 bg-emerald-500/[0.04]">
              <div className="absolute -top-px right-4 bg-emerald-500 text-black text-[10px] font-mono font-bold px-3 py-1 tracking-[0.14em]">
                FULL DESK
              </div>
              <p className="mk-tick !text-emerald-400 mb-3">Pro</p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="mk-display text-[2.5rem] leading-none">
                  ${PRO_PRICE}
                </span>
                <span className="text-[var(--text-tertiary)]">/mo</span>
              </div>
              <p className="text-[13px] text-emerald-300 font-medium mb-1">
                {PRO_ANNUAL_PER_MO_LABEL} on annual · save ~${PRO_ANNUAL_SAVE_USD}
              </p>
              <p className="text-sm text-emerald-400 mb-5">
                {trialAvailable ? "7-day free trial" : "Billed at checkout"}
              </p>
              <ul className="text-[12px] text-[var(--text-secondary)] space-y-2 mb-6 flex-1">
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  Structure + Dilution Radar
                </li>
                <li className="flex gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  Markets Floor + session tools
                </li>
              </ul>
              {session ? (
                <div className="space-y-2">
                  <CheckoutButton
                    size="lg"
                    className="w-full cta-glow"
                    tier="pro"
                    plan="monthly"
                  >
                    {trialAvailable ? "Start Pro trial" : `Subscribe — ${PRO_PRICE_MO}`}
                  </CheckoutButton>
                  <CheckoutButton
                    size="sm"
                    className="w-full"
                    showIcon={false}
                    tier="pro"
                    plan="annual"
                  >
                    Annual — {PRO_ANNUAL_LABEL}
                  </CheckoutButton>
                </div>
              ) : (
                <Link href="/login?register=true&next=checkout" className="block">
                  <Button size="lg" className="w-full cta-glow">
                    Create account for Pro
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mb-10 price-rise"
            style={{ animationDelay: "0.16s" }}
          >
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              Free → Plus → Pro · cancel anytime
            </span>
            <span className="mk-tick inline-flex items-center gap-1.5 normal-case !tracking-[0.08em]">
              <Megaphone className="w-3.5 h-3.5 text-emerald-500" />
              No paid news firehose
            </span>
          </div>

          <div className="max-w-3xl mx-auto mb-12 price-rise" style={{ animationDelay: "0.22s" }}>
            <LiveProofStrip compact />
          </div>

          <div
            className="mk-corners grid grid-cols-2 lg:grid-cols-4 border-t border-l mk-hairline mb-14 price-rise"
            style={{ animationDelay: "0.28s" }}
          >
            {pillars.map((p) => (
              <div key={p.title} className="border-b border-r mk-hairline p-5">
                <p.icon className="w-4.5 h-4.5 text-emerald-500/90 mb-2.5" />
                <p className="font-semibold text-sm tracking-tight mb-1">{p.title}</p>
                <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mb-12 price-rise" style={{ animationDelay: "0.34s" }}>
            <h2 className="mk-display text-xl sm:text-2xl mb-8 text-center">
              What you get
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

          <div className="max-w-2xl mx-auto text-center border-t mk-hairline pt-10">
            <p className="text-sm text-[var(--text-tertiary)] mb-2">
              Explore without paying: demo, daily plan, and measured wins.
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
