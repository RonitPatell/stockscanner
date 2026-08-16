import { NextRequest, NextResponse } from "next/server";
import {
  enforceSingleOpenSubscription,
  getStripe,
} from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { recordTrialClaims } from "@/lib/trial-claims";
import { consumeTrialForUser, hasConsumedTrial } from "@/lib/trial";
import { track } from "@/lib/analytics/track";
import { planTierFromCheckoutMeta } from "@/lib/subscription";
import Stripe from "stripe";

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  return typeof price === "string" ? price : price?.id ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (userId && session.subscription) {
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

        const periodEnd = (
          sub as Stripe.Subscription & { current_period_end?: number }
        ).current_period_end;
        const stripeEndsAt = periodEnd
          ? new Date(periodEnd * 1000)
          : undefined;
        const planTier = planTierFromCheckoutMeta({
          tier: session.metadata?.tier ?? sub.metadata?.tier,
          plan: session.metadata?.plan ?? sub.metadata?.plan,
          priceId: priceIdFromSubscription(sub),
        });

        if (sub.status === "trialing") {
          const consumed = await consumeTrialForUser({
            userId,
            email: prior.email,
            phoneNumber: prior.phoneNumber,
            stripe: {
              subscriptionId: sub.id,
              stripeCustomerId: customerId,
              planTier,
              cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            },
          });

          if (!consumed.ok) {
            // Race / replay: keep existing server trial window; attach Stripe ids only.
            await prisma.user.update({
              where: { id: userId },
              data: {
                subscriptionId: sub.id,
                subscriptionStatus: "trialing",
                planTier,
                hasUsedTrial: true,
                cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
                ...(customerId ? { stripeCustomerId: customerId } : {}),
                // Do not extend or reset trialEndsAt on replay.
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

          void track("trial_started", { tier: planTier });
        } else {
          // Paid immediately (no trial) or returning checkout — never restart trial.
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionId: sub.id,
              subscriptionStatus: sub.status,
              planTier,
              hasUsedTrial: true,
              ...(hasConsumedTrial(prior)
                ? {}
                : {
                    trialConsumedAt: new Date(),
                    // No free trial window when starting paid without trial.
                  }),
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
            void track("paid_conversion", { tier: planTier });
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
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (userId) {
        const periodEnd = (
          sub as Stripe.Subscription & { current_period_end?: number }
        ).current_period_end;
        const prevStatus = (
          event.data.previous_attributes as { status?: string } | undefined
        )?.status;
        const status =
          sub.status === "trialing"
            ? "trialing"
            : sub.cancel_at_period_end && sub.status === "active"
              ? "active"
              : sub.status;

        const planTier = planTierFromCheckoutMeta({
          tier: sub.metadata?.tier,
          plan: sub.metadata?.plan,
          priceId: priceIdFromSubscription(sub),
        });

        const existing = await prisma.user.findUnique({
          where: { id: userId },
          select: { trialEndsAt: true, trialConsumedAt: true, hasUsedTrial: true },
        });

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: status,
            planTier,
            cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
            // Never clear trialConsumedAt / trialEndsAt / hasUsedTrial here.
            ...(status === "trialing" && existing?.trialEndsAt
              ? { subscriptionEndsAt: existing.trialEndsAt }
              : periodEnd
                ? { subscriptionEndsAt: new Date(periodEnd * 1000) }
                : {}),
          },
        });

        if (prevStatus === "trialing" && sub.status === "active") {
          void track("paid_conversion", { tier: planTier });
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (userId) {
        // Keep trialConsumedAt / trialEndsAt / hasUsedTrial — trial must not reset.
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: "canceled",
            subscriptionId: null,
            planTier: "free",
            cancelAtPeriodEnd: false,
          },
          select: { cancelReason: true },
        });
        void track("cancellation");
        if (user.cancelReason) {
          void track("cancellation_reason", { reason: user.cancelReason });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
