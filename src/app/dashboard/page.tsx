import Link from "next/link";
import { redirect } from "next/navigation";
import { Zap, Settings, LogOut, CreditCard } from "lucide-react";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LiveScanner } from "@/components/LiveScanner";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();
  const isSubscribed = session?.user?.id
    ? (await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { subscriptionStatus: true },
      }))?.subscriptionStatus === "active"
    : false;

  // Allow demo access without subscription for development
  const hasAccess = isSubscribed || process.env.NODE_ENV === "development" || !session;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="font-bold">
              Ticker<span className="text-emerald-400">Trust</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                {!isSubscribed && (
                  <SubscribeButton />
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
        {!hasAccess ? (
          <div className="text-center py-20">
            <CreditCard className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Subscription Required</h2>
            <p className="text-zinc-400 mb-6">Subscribe to access the live catalyst scanner.</p>
            <SubscribeButton large />
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

function SubscribeButton({ large }: { large?: boolean }) {
  return (
    <form
      action={async () => {
        "use server";
        const session = await auth();
        if (!session?.user?.id) {
          redirect("/login?register=true");
        }
        // Client-side checkout is handled via API - redirect to pricing for now
        redirect("/pricing");
      }}
    >
      <Button size={large ? "lg" : "sm"} type="submit">
        <CreditCard className="w-4 h-4" /> Subscribe $40/mo
      </Button>
    </form>
  );
}
