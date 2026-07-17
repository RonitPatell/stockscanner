import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { PopoutWorkspace } from "@/components/PopoutWorkspace";
import { isPopoutPanelId, POPOUT_PANELS } from "@/components/MarketMonitor";

export function generateStaticParams() {
  return Object.keys(POPOUT_PANELS).map((panel) => ({ panel }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ panel: string }>;
}) {
  const { panel } = await params;
  const title = isPopoutPanelId(panel) ? POPOUT_PANELS[panel].title : "Panel";
  return {
    title: `${title} — TrustTicker`,
    robots: { index: false, follow: false },
  };
}

export default async function PopoutPage({
  params,
}: {
  params: Promise<{ panel: string }>;
}) {
  const { panel } = await params;
  if (!isPopoutPanelId(panel)) notFound();

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/popout/${panel}`)}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, subscriptionEndsAt: true },
  });
  if (!hasActiveSubscription(user ?? undefined)) {
    redirect("/pricing");
  }

  return <PopoutWorkspace panel={panel} />;
}
