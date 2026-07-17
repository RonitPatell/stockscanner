import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getCachedFeed } from "@/lib/feed-cache";
import { PropDesk } from "@/components/PropDesk";
import { UserMenu } from "@/components/UserMenu";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import type { CatalystItem, ScannerFilters } from "@/types";

export const metadata = {
  title: "Prop Desk — TrustTicker",
  description: "Focused prop-style desk: calls, dilution, session plan, and live feed.",
};

export default async function DeskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let isSubscribed = false;
  let initialCatalysts: CatalystItem[] = [];
  let initialWatchlist: string[] = [];
  let initialFilters: ScannerFilters | null = null;

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
    if (!isSubscribed) redirect("/demo");

    const [catalysts, cached] = await Promise.all([
      getCatalysts(100),
      getCachedFeed("all"),
    ]);
    initialCatalysts = catalysts.length > 0 ? catalysts : cached.items.slice(0, 100);
    initialWatchlist = (user?.watchlist ?? []).map((s) => s.toUpperCase());
    if (user?.scannerFilters && typeof user.scannerFilters === "object") {
      initialFilters = user.scannerFilters as ScannerFilters;
    }
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="desk-shell h-screen flex flex-col overflow-hidden bg-zinc-950">
      <header className="shrink-0 relative z-[110] border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandHomeLink />
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-500/40 text-orange-300">
              Prop Desk
            </span>
            <Link href="/dashboard" className="text-[11px] text-zinc-500 hover:text-zinc-200">
              Full scanner
            </Link>
          </div>
          <UserMenu />
        </div>
      </header>
      <main className="flex-1 min-h-0 max-w-[1680px] w-full mx-auto px-3 sm:px-4 py-3 overflow-hidden">
        <PropDesk
          initialCatalysts={initialCatalysts}
          initialWatchlist={initialWatchlist}
          initialFilters={initialFilters}
        />
      </main>
    </div>
  );
}
