import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Check,
  ArrowLeft,
  Zap,
  ShieldAlert,
  Target,
  Gauge,
  Megaphone,
  FlaskConical,
  Keyboard,
  Bell,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/CheckoutButton";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { LogoMark } from "@/components/Logo";
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
  {
    icon: Gauge,
    title: "Speed",
    body: "Wire ingest + SSE push. Auditable under-3m live-race proof on /wins.",
  },
  {
    icon: Target,
    title: "Judgment",
    body: "Playbooks, anti-FOMO, dilution radar — know when to skip.",
  },
  {
    icon: FlaskConical,
    title: "Proof",
    body: "Speed edge ledger, candle backtests, EOD Daily Edge vs $19.99.",
  },
  {
    icon: Megaphone,
    title: "Desk",
    body: "Call board, Prop Desk, hotkeys, sympathy map, session plan.",
  },
];

const included = [
  {
    group: "Speed & feed",
    items: [
      "Near-real-time wire ingest (~2s cycles) + SSE live push",
      "Stock-impact headlines only — noise filtered at ingest",
      "Story clustering across duplicate wires",
      "Source trust tiers + verified confidence",
      "Public speed wins page — publish → feed proof",
      "Live trust bar — freshness & ingest latency",
    ],
  },
  {
    group: "Judgment stack",
    items: [
      "Action playbooks: Long / Short / Watch / Skip + invalidation",
      "Anti-FOMO scoring on every expanded catalyst",
      "Dilution radar for offerings & ATM traps",
      "Session plan (3 setups / 2 skips) + watchlist autopsy",
      "Sympathy map + 12h catalyst replay",
      "AI sentiment, setup tags, float / RVol / historical moves",
    ],
  },
  {
    group: "Proof & ROI",
    items: [
      "Speed edge ledger — paper $ if you acted at ingest vs +3m",
      "Verified 1-minute candle speed backtests when available",
      "Paper trade stamps on catalysts",
      "Morning + EOD email briefs with Daily Edge Recap",
      "Cancel anytime — no contracts",
    ],
  },
  {
    group: "Desk & alerts",
    items: [
      "Prop Desk (/desk) focused trading layout",
      "Shared call board — who called it first",
      "Trader hotkeys (j/k, Enter, w, 1/2/3, /)",
      "Pro alert rules: HOD, VWAP, float, RVol, urgency",
      "Discord, email, SMS, and browser push",
      "Chrome overlay for TradingView charts",
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
      },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
    if (user?.hasUsedTrial) {
      trialAvailable = false;
    } else if (user?.phoneNumber) {
      const phoneTrialUsed = await prisma.user.findFirst({
        where: {
          phoneNumber: user.phoneNumber,
          hasUsedTrial: true,
          NOT: { id: session.user.id },
        },
      });
      trialAvailable = !phoneTrialUsed;
    }
  }

  if (isSubscribed) {
    redirect("/dashboard");
  }

  return (
    <div className="marketing-shell min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
      <div className="hero-aurora absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/15 blur-[120px] pointer-events-none" />
      <div className="hero-aurora-2 absolute bottom-0 right-0 w-[420px] h-[420px] bg-cyan-500/10 blur-[100px] pointer-events-none" />

      <header className="relative border-b border-zinc-800/80 px-4 sm:px-6 h-16 flex items-center backdrop-blur-xl bg-zinc-950/60">
        <Link
          href="/"
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <LogoMark className="w-7 h-7" />
            <span className="font-bold display-font">TrustTicker</span>
          </div>
        </Link>
      </header>

      <main className="relative flex-1 px-4 py-14 sm:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 price-rise">
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-[0.22em] mb-4">
              Simple pricing
            </p>
            <h1 className="text-3xl sm:text-5xl font-extrabold mb-4 tracking-tight">
              One plan. The whole judgment stack.
            </h1>
            <p className="text-zinc-400 max-w-2xl mx-auto text-lg">
              Free gets you the habit. Pro gets you the live desk. Lock annual and save —
              reinvest goes to faster wire later.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-10 max-w-3xl mx-auto price-rise">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-left">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Free (no account needed)</p>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li>· Public daily plan at /today</li>
                <li>· Demo scanner (sample data)</li>
                <li>· Speed wins proof page</li>
                <li>· Ticker info pages</li>
              </ul>
              <Link href="/today" className="inline-block mt-4 text-sm text-emerald-400 hover:underline">
                See today’s plan →
              </Link>
            </div>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-5 text-left">
              <p className="text-xs uppercase tracking-wide text-emerald-400 mb-2">Pro — live desk</p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>· Live wire feed + SSE (the real product)</li>
                <li>· Alerts, dilution, Prop Desk, briefs</li>
                <li>· Monthly ${SUBSCRIPTION_PRICE}/mo or annual ${SUBSCRIPTION_ANNUAL_PRICE}/yr</li>
                <li>· Annual is cheaper — {SUBSCRIPTION_ANNUAL_SAVE} vs paying monthly</li>
              </ul>
            </div>
          </div>

          {params.canceled === "true" && (
            <div className="mb-8 max-w-lg mx-auto rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. Start your trial whenever you&apos;re ready.
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
            {pillars.map((p, i) => (
              <div
                key={p.title}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 price-rise hover:border-emerald-500/30 transition-colors"
                style={{ animationDelay: `${0.1 + i * 0.08}s` }}
              >
                <p.icon className="w-5 h-5 text-emerald-400 mb-2" />
                <p className="font-semibold text-sm mb-1">{p.title}</p>
                <p className="text-[12px] text-zinc-500 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-8 items-start">
            <div className="lg:col-span-2 space-y-4 price-rise sticky top-8" style={{ animationDelay: "0.2s" }}>
              {/* Monthly */}
              <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-zinc-700 text-zinc-100 text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wide">
                  MONTHLY
                </div>
                <div className="mb-4 pr-16">
                  <h2 className="text-lg font-bold display-font">Pro Monthly</h2>
                  <p className="text-sm text-zinc-400">Flexible · cancel anytime</p>
                </div>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold tracking-tight">${SUBSCRIPTION_PRICE}</span>
                  <span className="text-zinc-400">/mo</span>
                </div>
                <p className="text-xs text-zinc-500 mb-4">
                  Billed monthly · ${Math.round(SUBSCRIPTION_PRICE * 12)}/yr if you stay all year
                </p>
                <p className="text-sm text-emerald-400 mb-5">
                  {trialAvailable
                    ? "7-day free trial included"
                    : "No trial — billed immediately at checkout"}
                </p>
                {session ? (
                  <CheckoutButton size="lg" className="w-full text-base cta-glow" plan="monthly">
                    {trialAvailable ? "Start free trial" : `Subscribe — ${SUBSCRIPTION_PRICE_MO}`}
                  </CheckoutButton>
                ) : (
                  <Link href="/login?register=true&next=checkout" className="block">
                    <Button size="lg" className="w-full text-base cta-glow">
                      Create account & start trial
                    </Button>
                  </Link>
                )}
              </div>

              {/* Annual */}
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 glow-emerald relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wide">
                  BEST VALUE
                </div>
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-500/15 via-transparent to-transparent pointer-events-none" />
                <div className="relative mb-4 pr-20">
                  <h2 className="text-lg font-bold display-font">Pro Annual</h2>
                  <p className="text-sm text-zinc-400">Same Pro desk · cheaper by the year</p>
                </div>
                <div className="relative flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold tracking-tight">
                    ${SUBSCRIPTION_ANNUAL_PRICE}
                  </span>
                  <span className="text-zinc-400">/yr</span>
                </div>
                <p className="relative text-sm text-emerald-300 font-medium mb-1">
                  {SUBSCRIPTION_ANNUAL_PER_MO_LABEL} effective · {SUBSCRIPTION_ANNUAL_SAVE}
                </p>
                <p className="relative text-xs text-zinc-400 mb-4">
                  vs ${Math.round(SUBSCRIPTION_PRICE * 12)}/yr on monthly — you keep ~$
                  {SUBSCRIPTION_ANNUAL_SAVE_USD} (about{" "}
                  {Math.round(SUBSCRIPTION_ANNUAL_SAVE_USD / SUBSCRIPTION_PRICE)} months free)
                </p>
                <p className="relative text-sm text-emerald-400 mb-5">
                  {trialAvailable
                    ? "7-day free trial, then billed annually"
                    : "Billed annually at checkout"}
                </p>
                {session ? (
                  <CheckoutButton size="lg" className="w-full text-base cta-glow" plan="annual">
                    Lock annual — {SUBSCRIPTION_ANNUAL_LABEL}
                  </CheckoutButton>
                ) : (
                  <Link href="/login?register=true&next=checkout" className="block">
                    <Button size="lg" className="w-full text-base cta-glow">
                      Create account & lock annual
                    </Button>
                  </Link>
                )}
                <p className="relative text-[11px] text-zinc-500 mt-3 text-center">
                  Same features as monthly — just a lower effective rate
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                <Zap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                See → Skip → Prove — cancel anytime
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                <Bell className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Discord · email · SMS · push · Chrome overlay
              </div>
              {!session && (
                <p className="text-center text-sm text-zinc-500 px-1">
                  Already have an account?{" "}
                  <Link href="/login?next=checkout" className="text-emerald-400 hover:underline">
                    Sign in
                  </Link>
                </p>
              )}
            </div>

            <div className="lg:col-span-3 space-y-6 price-rise" style={{ animationDelay: "0.28s" }}>
              {included.map((section) => (
                <div
                  key={section.group}
                  className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5 sm:p-6"
                >
                  <h3 className="text-sm font-semibold text-emerald-400/90 uppercase tracking-[0.14em] mb-4 flex items-center gap-2">
                    {section.group === "Speed & feed" && <Gauge className="w-4 h-4" />}
                    {section.group === "Judgment stack" && <ShieldAlert className="w-4 h-4" />}
                    {section.group === "Proof & ROI" && <FlaskConical className="w-4 h-4" />}
                    {section.group === "Desk & alerts" && <Keyboard className="w-4 h-4" />}
                    {section.group}
                  </h3>
                  <ul className="space-y-2.5">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12 max-w-2xl mx-auto text-center">
            <p className="text-zinc-500 text-sm mb-4">
              Prefer to poke around first?{" "}
              <Link href="/today" className="text-emerald-400 hover:underline">
                Today’s free plan
              </Link>
              ,{" "}
              <Link href="/demo" className="text-emerald-400 hover:underline">
                live demo
              </Link>
              , or{" "}
              <Link href="/wins" className="text-emerald-400 hover:underline">
                speed wins
              </Link>
              .
            </p>
            <DisclaimerBanner compact />
          </div>
        </div>
      </main>
    </div>
  );
}
