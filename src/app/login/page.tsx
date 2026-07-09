import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ register?: string; next?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;

  if (session?.user) {
    if (params.next === "checkout") {
      redirect("/subscribe");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    redirect(hasActiveSubscription(user ?? undefined) ? "/dashboard" : "/demo");
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-zinc-500">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
