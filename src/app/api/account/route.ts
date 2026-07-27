import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Statuses that mean an open subscription — cancel in Stripe first. */
function hasOpenSubscription(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Permanently delete the signed-in account.
 * Blocked while Pro is active/trialing/past_due — cancel via billing portal first.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`account-delete:${session.user.id}:${ip}`, 5, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const confirmation = String(body?.confirmation ?? "").trim().toUpperCase();
  if (confirmation !== "DELETE") {
    return NextResponse.json(
      { error: 'Type DELETE to confirm account deletion' },
      { status: 400 }
    );
  }

  const password = String(body?.password ?? "");
  if (!password || password.length > 72) {
    return NextResponse.json(
      { error: "Enter your password to delete this account" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      stripeCustomerId: true,
    },
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  if (hasOpenSubscription(user.subscriptionStatus)) {
    return NextResponse.json(
      {
        error:
          "Cancel your subscription first in Manage billing, then delete your account after it is no longer active or trialing.",
        code: "SUBSCRIPTION_ACTIVE",
        subscriptionStatus: user.subscriptionStatus,
      },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({
    ok: true,
    message: "Account deleted",
  });
}
