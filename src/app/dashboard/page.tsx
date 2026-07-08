import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { TradingDashboard } from "@/components/TradingDashboard";
import { CheckoutButton } from "@/components/CheckoutButton";
import { SubscriptionActivating } from "@/components/SubscriptionActivating";
import { UserMenu } from "@/components/UserMenu";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  // Logged-out visitors can preview; logged-in users need an active subscription
  const hasAccess =
    isSubscribed ||
    process.env.NODE_ENV === "development" ||
    !session;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-950">
      <header className="shrink-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <Link href="/" prefetch className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <LogoMark className="w-7 h-7" />
            <span className="font-bold">
              Trust<span className="text-emerald-400">Ticker</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                {!isSubscribed && (
                  <CheckoutButton size="sm">Subscribe $40/mo</CheckoutButton>
                )}
                <UserMenu />
              </>
            ) : (
              <Link href="/login">
                <Button size="sm">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-3 sm:px-4 py-2 overflow-hidden">
        {params.subscribed === "true" && isSubscribed && (
          <div className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 shrink-0">
            Subscription active — welcome to TrustTicker Pro!
          </div>
        )}

        {params.subscribed === "true" && !isSubscribed && session && (
          <SubscriptionActivating />
        )}

        {!hasAccess ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-2">Start your 7-day free trial</h2>
            <p className="text-zinc-400 mb-6">
              You&apos;re signed in. Add a payment method to unlock the live catalyst scanner.
              You won&apos;t be charged until the trial ends.
            </p>
            <CheckoutButton size="lg" className="w-full text-base">
              Start Free Trial — $40/mo after
            </CheckoutButton>
            <p className="text-xs text-zinc-600 mt-4">Cancel anytime from Settings</p>
          </div>
        ) : (
          <TradingDashboard />
        )}
      </main>
    </div>
  );
}
