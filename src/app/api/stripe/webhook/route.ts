import { NextRequest, NextResponse } from "next/server";
import {
  enforceSingleOpenSubscription,
  getStripe,
} from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { recordTrialClaims } from "@/lib/trial-claims";
import { consumeTrialForUser, hasConsumedTrial } from "@/lib/trial";
import { track } from "@/lib/analytics/track";
import {
  claimStripeEvent,
  releaseStripeEvent,
} from "@/lib/billing/webhook-idempotency";
import {
  mapDeletedSubscriptionToUserFields,
  mapStripeSubscriptionToUserFields,
} from "@/lib/billing/subscription-apply";
import Stripe from "stripe";

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  return typeof price === "string" ? price : price?.id ?? null;
}

function periodEndFromSubscription(sub: Stripe.Subscription): Date | null {
  const periodEnd = (
    sub as Stripe.Subscription & { current_period_end?: number }
  ).current_period_end;
  return periodEnd ? new Date(periodEnd * 1000) : null;
}

async function resolveUserIdFromSubscription(
  sub: Stripe.Subscription
): Promise<string | null> {
  if (sub.metadata?.userId) return sub.metadata.userId;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function applySubscriptionSnapshot(
  userId: string,
  sub: Stripe.Subscription
): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialEndsAt: true },
  });
  const mapped = mapStripeSubscriptionToUserFields({
    status: sub.status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    periodEnd: periodEndFromSubscription(sub),
    trialEndsAt: existing?.trialEndsAt ?? null,
    priceId: priceIdFromSubscription(sub),
    billingPeriod:
      sub.metadata?.billingPeriod === "annual"
        ? "annual"
        : sub.metadata?.billingPeriod === "monthly"
          ? "monthly"
          : null,
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionId: sub.id,
      subscriptionStatus: mapped.subscriptionStatus,
      planTier: mapped.planTier,
      cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
      ...(mapped.subscriptionEndsAt
        ? { subscriptionEndsAt: mapped.subscriptionEndsAt }
        : {}),
    },
  });
}

/** Exported for unit tests — processes a verified Stripe event object. */
export async function processStripeEvent(event: Stripe.Event): Promise<{
  handled: boolean;
  duplicate?: boolean;
}> {
  const claim = await claimStripeEvent({
    eventId: event.id,
    type: event.type,
  });
  if (claim === "duplicate") {
    return { handled: true, duplicate: true };
  }

  try {
    switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId || !session.subscription) break;

      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
      const prior = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionId: true,
          email: true,
          phoneNumber: true,
          hasUsedTrial: true,
          trialConsumedAt: true,
          trialEndsAt: true,
          welcomeEmailSent: true,
          name: true,
        },
      });
      if (!prior) break;

      let sub: Stripe.Subscription | null = null;
      if (customerId) {
        sub = await enforceSingleOpenSubscription(
          customerId,
          prior.subscriptionId ?? null
        );
      }
      if (!sub) {
        sub = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );
      }

      const stripeEndsAt = periodEndFromSubscription(sub);

      if (sub.status === "trialing") {
        const consumed = await consumeTrialForUser({
          userId,
          email: prior.email,
          phoneNumber: prior.phoneNumber,
          stripe: {
            subscriptionId: sub.id,
            stripeCustomerId: customerId,
            planTier: "pro",
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          },
        });

        if (!consumed.ok) {
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionId: sub.id,
              subscriptionStatus: "trialing",
              planTier: "pro",
              hasUsedTrial: true,
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
              ...(customerId ? { stripeCustomerId: customerId } : {}),
              ...(prior.trialEndsAt
                ? { subscriptionEndsAt: prior.trialEndsAt }
                : stripeEndsAt
                  ? { subscriptionEndsAt: stripeEndsAt }
                  : {}),
            },
          });
          await recordTrialClaims({
            email: prior.email,
            phoneNumber: prior.phoneNumber,
          });
        }

        void track("trial_started", { tier: "pro" });
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionId: sub.id,
            subscriptionStatus: sub.status,
            planTier: "pro",
            hasUsedTrial: true,
            ...(hasConsumedTrial(prior)
              ? {}
              : { trialConsumedAt: new Date() }),
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            ...(customerId ? { stripeCustomerId: customerId } : {}),
            ...(stripeEndsAt ? { subscriptionEndsAt: stripeEndsAt } : {}),
          },
        });
        await recordTrialClaims({
          email: prior.email,
          phoneNumber: prior.phoneNumber,
        });
        if (sub.status === "active") {
          void track("paid_conversion", { tier: "pro" });
        }
      }

      if (!prior.welcomeEmailSent && process.env.RESEND_API_KEY) {
        const { sendWelcomeEmail } = await import("@/lib/email-brief");
        const sent = await sendWelcomeEmail(prior.email, prior.name);
        if (sent) {
          await prisma.user.update({
            where: { id: userId },
            data: { welcomeEmailSent: true },
          });
        }
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(sub);
      if (!userId) break;

      const prevStatus = (
        event.data.previous_attributes as { status?: string } | undefined
      )?.status;

      await applySubscriptionSnapshot(userId, sub);

      if (prevStatus === "trialing" && sub.status === "active") {
        void track("paid_conversion", { tier: "pro" });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdFromSubscription(sub);
      if (!userId) break;
      const cleared = mapDeletedSubscriptionToUserFields();
      const user = await prisma.user.update({
        where: { id: userId },
        data: cleared,
        select: { cancelReason: true },
      });
      void track("cancellation");
      if (user.cancelReason) {
        void track("cancellation_reason", { reason: user.cancelReason });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) break;
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      if (!user) break;
      await prisma.user.update({
        where: { id: user.id },
        data: { subscriptionStatus: "past_due" },
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) break;
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, subscriptionId: true },
      });
      if (!user?.subscriptionId) break;
      try {
        const sub = await getStripe().subscriptions.retrieve(user.subscriptionId);
        await applySubscriptionSnapshot(user.id, sub);
      } catch (err) {
        console.error("invoice.paid subscription refresh failed", err);
      }
      break;
    }

    default:
      break;
    }

    return { handled: true };
  } catch (err) {
    await releaseStripeEvent(event.id);
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
  } catch (err) {
    console.error("Webhook processing failed:", err);
    // Release claim so Stripe retries are not treated as duplicates.
    try {
      await releaseStripeEvent(event.id);
    } catch (releaseErr) {
      console.error("Failed to release Stripe event claim:", releaseErr);
    }
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
