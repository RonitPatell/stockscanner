import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed } from "@/lib/feed-cache";
import { getCachedScannerSnapshot } from "@/lib/market-scanner";
import { TradingDashboard } from "@/components/TradingDashboard";
import { SubscriptionActivating } from "@/components/SubscriptionActivating";
import { UserMenu } from "@/components/UserMenu";
import { CheckoutButton } from "@/components/CheckoutButton";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { isDashboardShellV3Enabled } from "@/lib/dashboard-shell";
import type { CatalystItem, MarketScannerSnapshot, ScannerFilters } from "@/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string; view?: string; shell?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const shellV3 =
    params.shell === "v3" ||
    (params.shell !== "legacy" && isDashboardShellV3Enabled());

  let isSubscribed = false;
  let initialCatalysts: CatalystItem[] = [];
  let initialWatchlist: string[] = [];
  let initialFilters: ScannerFilters | null = null;
  let initialScanner: MarketScannerSnapshot | null = null;

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
        const [cached, scannerSnap] = await Promise.all([
          getCachedFeed("all"),
          getCachedScannerSnapshot(),
        ]);
        initialCatalysts = cached.items.slice(0, 150);
        if (initialCatalysts.length === 0) {
          try {
            initialCatalysts = await Promise.race([
              getCatalysts(150),
              new Promise<CatalystItem[]>((r) =>
                setTimeout(() => r([]), 2_500)
              ),
            ]);
          } catch {
            initialCatalysts = [];
          }
        }
        initialScanner = scannerSnap;
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
              <h1 className="text-lg font-semibold text-amber-200">Temporarily unavailable</h1>
              <p className="text-sm text-zinc-300">
                We couldn’t reach the database. Please try again in a minute. If this keeps
                happening, contact support.
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
    <div
      className={
        shellV3
          ? "dashboard-page desk-shell min-h-screen h-screen flex flex-col overflow-hidden bg-[var(--background)]"
          : "dashboard-page desk-shell min-h-screen xl:h-screen flex flex-col overflow-y-auto xl:overflow-hidden bg-[var(--background)]"
      }
    >
      {!shellV3 && (
        <header className="shrink-0 relative z-[110] border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl">
          <div className="max-w-[1680px] mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
            <BrandHomeLink />

            <div className="flex items-center gap-2">
              {session ? (
                <>
                  <Link
                    href="/desk"
                    className="text-[11px] text-zinc-400 hover:text-emerald-300 hidden sm:inline transition-colors"
                  >
                    Prop Desk
                  </Link>
                  {!isSubscribed && (
                    <CheckoutButton size="sm">Subscribe $19.99/mo</CheckoutButton>
                  )}
                  <UserMenu />
                </>
              ) : null}
            </div>
          </div>
        </header>
      )}

      <main
        className={
          shellV3
            ? "dashboard-main flex-1 min-h-0 w-full overflow-hidden"
            : "dashboard-main flex-1 min-h-0 max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-3 overflow-visible xl:overflow-hidden"
        }
      >
        {params.subscribed === "true" && isSubscribed && (
          <div className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 shrink-0 mx-3 mt-2">
            Subscription active — welcome to TrustTicker Pro!
          </div>
        )}

        {activatingCheckout && <SubscriptionActivating />}

        {isSubscribed ? (
          <TradingDashboard
            initialCatalysts={initialCatalysts}
            initialWatchlist={initialWatchlist}
            initialFilters={initialFilters}
            initialScanner={initialScanner}
            shellV3={shellV3}
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
