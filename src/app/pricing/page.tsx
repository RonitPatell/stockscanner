import Link from "next/link";
import { redirect } from "next/navigation";
import { Zap, Check, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { CheckoutButton } from "@/components/CheckoutButton";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

const SUBSCRIPTION_PRICE = 40;

const included = [
  "Live catalyst scanner with 30s refresh",
  "Smart keyword sentiment scoring (-100 to +100)",
  "Float, market cap, and volume on every ticker",
  "Premarket mover detection",
  "Historical similar-catalyst move data",
  "Discord webhook alerts",
  "Advanced filters (catalyst type, urgency, sentiment)",
  "Sound alerts for new catalysts",
  "Watchlist support",
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
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true },
    });
    isSubscribed = hasActiveSubscription(user?.subscriptionStatus);
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
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="font-bold">TrustTicker</span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Simple, transparent pricing</h1>
            <p className="text-zinc-400">One plan. Everything included. No hidden fees.</p>
          </div>

          {params.canceled === "true" && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 text-center">
              Checkout canceled. You can start your trial whenever you&apos;re ready.
            </div>
          )}

          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-900/50 p-8 glow-emerald relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-bl-lg">
              MOST POPULAR
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">TrustTicker Pro</h2>
              <p className="text-sm text-zinc-400">Full access to everything</p>
            </div>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl font-bold">${SUBSCRIPTION_PRICE}</span>
              <span className="text-zinc-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 mb-8">7-day free trial included</p>

            <div className="mb-8">
              {session ? (
                <CheckoutButton size="lg" className="w-full text-base">
                  Start Free Trial
                </CheckoutButton>
              ) : (
                <Link href="/login?register=true&next=checkout" className="block">
                  <Button size="lg" className="w-full text-base">
                    Create Account & Start Trial
                  </Button>
                </Link>
              )}
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
