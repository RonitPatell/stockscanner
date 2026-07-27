import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, getOrCreateStripeCustomer } from "@/lib/stripe";
import { hasTrialClaim } from "@/lib/trial-claims";
import { track } from "@/lib/analytics/track";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const plan = body?.plan === "annual" ? "annual" : "monthly";

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        stripeCustomerId: true,
        hasUsedTrial: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (plan === "annual" && !process.env.STRIPE_PRICE_ID_ANNUAL) {
      return NextResponse.json(
        { error: "Annual plan is not available right now — use monthly." },
        { status: 400 }
      );
    }

    const customerId = await getOrCreateStripeCustomer(
      user.id,
      user.email,
      user.stripeCustomerId
    );

    if (!user.stripeCustomerId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Trial abuse: account flag + durable email/phone hash claims (no phone required at signup)
    const claimUsed = await hasTrialClaim({
      email: user.email,
      phoneNumber: user.phoneNumber,
    });
    const allowTrial = !user.hasUsedTrial && !claimUsed;

    void track("checkout_started", { plan });

    const checkoutSession = await createCheckoutSession(
      customerId,
      user.id,
      user.email,
      allowTrial,
      plan
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Checkout failed. Please try again or contact support." },
      { status: 500 }
    );
  }
}
