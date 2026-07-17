import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCheckoutSession, getOrCreateStripeCustomer } from "@/lib/stripe";

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
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.phoneNumber) {
      return NextResponse.json(
        { error: "Add a phone number to your account before subscribing" },
        { status: 400 }
      );
    }

    if (plan === "annual" && !process.env.STRIPE_PRICE_ID_ANNUAL) {
      return NextResponse.json(
        { error: "Annual plan not configured yet — use monthly or set STRIPE_PRICE_ID_ANNUAL" },
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

    const phoneTrialUsed = user.phoneNumber
      ? await prisma.user.findFirst({
          where: {
            phoneNumber: user.phoneNumber,
            hasUsedTrial: true,
            NOT: { id: user.id },
          },
        })
      : null;

    const checkoutSession = await createCheckoutSession(
      customerId,
      user.id,
      user.email,
      !user.hasUsedTrial && !phoneTrialUsed,
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
