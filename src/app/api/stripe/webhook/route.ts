import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

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
        const sub = await getStripe().subscriptions.retrieve(session.subscription as string);
        const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
        const user = await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionId: sub.id,
            subscriptionStatus: sub.status,
            hasUsedTrial: true,
            subscriptionEndsAt: periodEnd ? new Date(periodEnd * 1000) : undefined,
          },
          select: { email: true, name: true, welcomeEmailSent: true },
        });

        if (user && !user.welcomeEmailSent && process.env.RESEND_API_KEY) {
          const { sendWelcomeEmail } = await import("@/lib/email-brief");
          const sent = await sendWelcomeEmail(user.email, user.name);
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
        const periodEnd = (sub as Stripe.Subscription & { current_period_end?: number }).current_period_end;
        const status =
          sub.status === "trialing"
            ? "trialing"
            : sub.cancel_at_period_end && sub.status === "active"
              ? "active"
              : sub.status;

        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: status,
            ...(periodEnd ? { subscriptionEndsAt: new Date(periodEnd * 1000) } : {}),
          },
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionStatus: "canceled",
            subscriptionId: null,
          },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
