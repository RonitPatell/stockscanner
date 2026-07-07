import Link from "next/link";
import { Zap, Settings, LogOut } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { LiveScanner } from "@/components/LiveScanner";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { CheckoutButton } from "@/components/CheckoutButton";
import { SubscriptionActivating } from "@/components/SubscriptionActivating";
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
      select: { subscriptionStatus: true },
    });
    isSubscribed = hasActiveSubscription(user?.subscriptionStatus);
  }

  // Logged-out visitors can preview; logged-in users need an active subscription
  const hasAccess =
    isSubscribed ||
    process.env.NODE_ENV === "development" ||
    !session;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-black" />
            </div>
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
                <Link href="/settings">
                  <Button variant="ghost" size="icon">
                    <Settings className="w-4 h-4" />
                  </Button>
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <Button variant="ghost" size="icon" type="submit">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </form>
              </>
            ) : (
              <Link href="/login">
                <Button size="sm">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {params.subscribed === "true" && isSubscribed && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
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
          <>
            <LiveScanner />
            <div className="mt-8">
              <DisclaimerBanner />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
