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
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database unavailable";
      const offline =
        message.includes("Can't reach database server") ||
        message.includes("Connection timed out") ||
        message.includes("ENOTFOUND");
      if (offline) {
        return (
          <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
            <div className="max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 space-y-3">
              <h1 className="text-lg font-semibold text-amber-200">Database offline</h1>
              <p className="text-sm text-zinc-300">
                Neon could not be reached. Free Neon projects sleep or expire — open{" "}
                <a
                  href="https://console.neon.tech"
                  className="text-emerald-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  console.neon.tech
                </a>
                , copy a fresh connection string into <code className="text-amber-100">DATABASE_URL</code>, then run{" "}
                <code className="text-amber-100">npx prisma db push</code>.
              </p>
              <p className="text-xs text-zinc-500">
                Test locally: <code className="text-zinc-400">node --env-file=.env scripts/test-db.mjs</code>
              </p>
            </div>
          </div>
        );
      }
      throw error;
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
                  <CheckoutButton size="sm">Subscribe $19.99/mo</CheckoutButton>
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
