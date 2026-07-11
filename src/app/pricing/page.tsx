import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ArrowLeft, Zap } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/CheckoutButton";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { LogoMark } from "@/components/Logo";
import { SUBSCRIPTION_PRICE, SUBSCRIPTION_PRICE_MO } from "@/lib/stripe";

const highlights = [
  { label: "~8s", desc: "Wire ingest cycle" },
  { label: "SSE", desc: "Instant dashboard push" },
  { label: "Pro", desc: "Alert rules & briefs" },
];

const included = [
  "Near-real-time catalyst feed (~8s wire cycles + SSE streaming)",
  "Stock-impact headlines only — noise filtered at ingest",
  "Story clustering across duplicate wire sources",
  "AI sentiment scoring (-100 to +100) + catalyst type",
  "Setup tags: gapper, sympathy, sector, heavy volume",
  "Source trust tiers + verified confidence badges",
  "Watchlist morning brief & EOD recap",
  "Pro alert rules: HOD, VWAP, float, RVol, news urgency",
  "Float, market cap, and relative volume on every ticker",
  "Historical similar-catalyst move averages",
  "Market state panel (VIX, indices, sectors)",
  "Discord webhook + sound alerts",
  "Advanced filters (catalyst type, urgency, sentiment)",
  "Catalyst playbooks with float-bucket historical stats",
  "Live trust bar — feed freshness & ingest latency",
  "Premarket command center (gappers + overnight brief)",
  "60-second onboarding wizard for new subscribers",
  "Daily morning + EOD email briefs (watchlist recap)",
  "Welcome email on subscription",
  "Email + browser push alerts (Discord + SMS too)",
  "Public speed wins page — auditable publish → feed proof",
  "SEO ticker pages for organic traffic",
  "Cancel anytime — no contracts",
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
      select: { subscriptionStatus: true, subscriptionEndsAt: true, hasUsedTrial: true, phoneNumber: true },
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
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <LogoMark className="w-7 h-7" />
            <span className="font-bold">TrustTicker</span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">
              One plan. Everything a catalyst trader needs.
            </h1>
            <p className="text-zinc-400 max-w-md mx-auto">
              Near-real-time wire ingest, story clustering, pro alert rules, and watchlist briefs —
              flat price, no upsells.
            </p>
          </div>

          {params.canceled === "true" && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. You can start your trial whenever you&apos;re ready.
            </div>
          )}

          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-900/50 p-8 glow-emerald relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-bl-lg">
              TRUSTTICKER PRO
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">TrustTicker Pro</h2>
              <p className="text-sm text-zinc-400">
                Full scanner · clustering · briefs · alert rules
              </p>
            </div>

            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-5xl font-bold">${SUBSCRIPTION_PRICE}</span>
              <span className="text-zinc-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 mb-6">
              {trialAvailable ? "7-day free trial included" : "No trial — billed immediately at checkout"}
            </p>

            <div className="grid grid-cols-3 gap-2 mb-8">
              {highlights.map((h) => (
                <div
                  key={h.label}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center"
                >
                  <div className="text-lg font-bold text-emerald-400 font-mono">{h.label}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{h.desc}</div>
                </div>
              ))}
            </div>

            <div className="mb-8">
              {session ? (
                <CheckoutButton size="lg" className="w-full text-base">
                  {trialAvailable ? "Start Free Trial" : `Subscribe — ${SUBSCRIPTION_PRICE_MO}`}
                </CheckoutButton>
              ) : (
                <Link href="/login?register=true&next=checkout" className="block">
                  <Button size="lg" className="w-full text-base">
                    Create Account & Start Trial
                  </Button>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-4">
              <Zap className="w-3.5 h-3.5 text-emerald-500" />
              Faster than polling — wire hits pushed live via SSE
            </div>

            <ul className="space-y-3">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {!session && (
            <p className="text-center text-sm text-zinc-500 mt-6">
              Already have an account?{" "}
              <Link href="/login?next=checkout" className="text-emerald-400 hover:underline">
                Sign in to subscribe
              </Link>
            </p>
          )}

          <div className="mt-8">
            <DisclaimerBanner compact />
          </div>
        </div>
      </main>
    </div>
  );
}
