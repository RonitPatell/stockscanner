import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { DemoDashboard } from "@/components/demo/DemoDashboard";
import { UserMenu } from "@/components/UserMenu";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Demo — TrustTicker",
  description: "Sample catalyst scanner demo with illustrative data.",
};

export default async function DemoPage() {
  const session = await auth();

  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
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
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 ml-1">
              Demo
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                {!isSubscribed && (
                  <Link href="/pricing">
                    <Button size="sm">See pricing</Button>
                  </Link>
                )}
                <UserMenu />
              </>
            ) : (
              <>
                <Link href="/pricing">
                  <Button size="sm">Start Free Trial</Button>
                </Link>
                <Link href="/login">
                  <Button size="sm" variant="outline">
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-3 sm:px-4 py-2 overflow-hidden">
        <DemoDashboard />
      </main>
    </div>
  );
}
