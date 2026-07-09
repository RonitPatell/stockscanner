import { Navbar } from "@/components/Navbar";
import { MarketingLanding } from "@/components/landing/MarketingLanding";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";

export default async function HomePage() {
  const session = await auth();
  const displayName = session?.user
    ? session.user.name || session.user.email?.split("@")[0] || "Trader"
    : undefined;

  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  return (
    <>
      <Navbar />
      <MarketingLanding displayName={displayName} isSubscribed={isSubscribed} />
    </>
  );
}
