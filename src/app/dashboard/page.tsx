import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed } from "@/lib/feed-cache";
import { TradingDashboard } from "@/components/TradingDashboard";
import { SubscriptionActivating } from "@/components/SubscriptionActivating";
import { UserMenu } from "@/components/UserMenu";
import { CheckoutButton } from "@/components/CheckoutButton";
import { LogoMark } from "@/components/Logo";
import type { CatalystItem, ScannerFilters } from "@/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  let isSubscribed = false;
  let initialCatalysts: CatalystItem[] = [];
  let initialWatchlist: string[] = [];
  let initialFilters: ScannerFilters | null = null;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        watchlist: true,
        scannerFilters: true,
      },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);

    if (isSubscribed) {
      const [catalysts, cached] = await Promise.all([
        getCatalysts(150),
        getCachedFeed("all"),
      ]);
      initialCatalysts =
        catalysts.length > 0 ? catalysts : cached.items.slice(0, 150);
      initialWatchlist = (user?.watchlist ?? []).map((s) => s.toUpperCase());
      if (user?.scannerFilters && typeof user.scannerFilters === "object") {
        initialFilters = user.scannerFilters as ScannerFilters;
      }
    }
  }

  const activatingCheckout =
    params.subscribed === "true" && !!session && !isSubscribed;

  if (!isSubscribed && !activatingCheckout) {
    redirect("/demo");
  }

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
            ) : null}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-3 sm:px-4 py-2 overflow-hidden">
        {params.subscribed === "true" && isSubscribed && (
          <div className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 shrink-0">
            Subscription active — welcome to TrustTicker Pro!
          </div>
        )}

        {activatingCheckout && <SubscriptionActivating />}

        {isSubscribed ? (
          <TradingDashboard
            initialCatalysts={initialCatalysts}
            initialWatchlist={initialWatchlist}
            initialFilters={initialFilters}
          />
        ) : (
          <div className="text-center py-20 max-w-md mx-auto">
            <p className="text-zinc-400 text-sm">
              Your live scanner will unlock as soon as subscription activation completes.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
