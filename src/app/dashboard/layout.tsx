import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { isMonitorV1Enabled } from "@/lib/monitor";
import { MonitorCriticalHints } from "@/components/monitor/MonitorCriticalHints";

/**
 * First-party preconnect / Monitor document prefetch for entitled sessions.
 * Does not expose provider endpoints. Does not poll the snapshot API.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let entitled = false;
  if (isMonitorV1Enabled()) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            subscriptionStatus: true,
            subscriptionEndsAt: true,
            hasUsedTrial: true,
            cancelAtPeriodEnd: true,
          },
        });
        entitled = hasActiveSubscription(user ?? undefined);
      }
    } catch {
      entitled = false;
    }
  }

  return (
    <>
      <MonitorCriticalHints entitled={entitled} />
      {children}
    </>
  );
}
