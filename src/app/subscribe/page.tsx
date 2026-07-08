import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { SubscribeRedirect } from "./SubscribeRedirect";

export default async function SubscribePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?next=checkout");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, subscriptionEndsAt: true },
  });

  if (hasActiveSubscription(user ?? undefined)) {
    redirect("/dashboard");
  }

  return <SubscribeRedirect />;
}
