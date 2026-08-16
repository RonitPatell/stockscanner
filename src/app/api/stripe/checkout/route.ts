import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createBillingPortalSession,
  createCheckoutSession,
  getOrCreateStripeCustomer,
  listOpenSubscriptions,
} from "@/lib/stripe";
import { parseCheckoutRequest } from "@/lib/billing/pricing";
import { hasTrialClaim } from "@/lib/trial-claims";
import { evaluateTrialEligibility } from "@/lib/trial";
import { track } from "@/lib/analytics/track";
import { isOpenSubscriptionStatus } from "@/lib/subscription";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`stripe-checkout:${session.user.id}:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error, code: parsed.code },
        { status: 400 }
      );
    }
    const { billingPeriod } = parsed;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        stripeCustomerId: true,
        subscriptionId: true,
        subscriptionStatus: true,
        hasUsedTrial: true,
        trialConsumedAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      // Validate price env early for clearer errors
      const { resolveCheckoutPriceId } = await import("@/lib/billing/pricing");
      resolveCheckoutPriceId(billingPeriod);
    } catch {
      return NextResponse.json(
        {
          error:
            billingPeriod === "annual"
              ? "Annual plan is not configured yet."
              : "Monthly plan is not configured yet.",
        },
        { status: 400 }
      );
    }

    const customerId = await getOrCreateStripeCustomer(
      user.id,
      user.email,
      user.stripeCustomerId
    );

    if (!user.stripeCustomerId || user.stripeCustomerId !== customerId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const openOnStripe = await listOpenSubscriptions(customerId);
    const alreadyOpen =
      isOpenSubscriptionStatus(user.subscriptionStatus) || openOnStripe.length > 0;

    if (alreadyOpen) {
      const portal = await createBillingPortalSession(customerId);
      return NextResponse.json(
        {
          error:
            "You already have an active subscription. Manage or change it in billing — a second subscription was not created.",
          code: "ALREADY_SUBSCRIBED",
          url: portal.url,
        },
        { status: 409 }
      );
    }

    const claimUsed = await hasTrialClaim({
      email: user.email,
      phoneNumber: user.phoneNumber,
    });
    const { eligible: allowTrial } = evaluateTrialEligibility({
      user,
      durableClaimExists: claimUsed,
    });

    void track("checkout_started", { plan: billingPeriod });

    const checkoutSession = await createCheckoutSession(
      customerId,
      user.id,
      user.email,
      allowTrial,
      billingPeriod
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
