import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getPublicDemoPayload } from "@/lib/demo";
import { EvidenceDemo } from "@/components/demo/EvidenceDemo";
import { UserMenu } from "@/components/UserMenu";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { Button } from "@/components/ui/button";
import { FunnelViewBeacon } from "@/components/FunnelViewBeacon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Evidence Demo — TrustTicker",
  description:
    "Evidence-based catalyst demo: delayed real wires, historical replay, or curated cases — never fictional announcements.",
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

  const initial = await getPublicDemoPayload();

  return (
    <div className="min-h-screen flex flex-col bg-[#05080d] desk-shell">
      <FunnelViewBeacon event="demo_view" />
      <header className="shrink-0 sticky top-0 z-[110] border-b mk-hairline bg-black/55 backdrop-blur-xl">
        <div className="max-w-[900px] mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandHomeLink />
            <span className="text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 border mk-hairline text-zinc-500">
              Evidence demo
            </span>
          </div>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                {!isSubscribed && (
                  <Link href="/pricing">
                    <Button size="sm" className="cta-glow">
                      See pricing
                    </Button>
                  </Link>
                )}
                {isSubscribed && (
                  <Link href="/dashboard">
                    <Button size="sm">Open scanner</Button>
                  </Link>
                )}
                <UserMenu />
              </>
            ) : (
              <>
                <Link href="/pricing">
                  <Button size="sm" className="cta-glow">
                    Start Free Trial
                  </Button>
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

      <main className="flex-1 min-h-0 max-w-[900px] w-full mx-auto px-3 sm:px-4 py-3 sm:py-4">
        <div className="h-[calc(100vh-4.5rem)] min-h-[28rem]">
          <EvidenceDemo initial={initial} />
        </div>
      </main>
    </div>
  );
}
