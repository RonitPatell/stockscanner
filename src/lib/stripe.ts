import Stripe from "stripe";
import { isOpenSubscriptionStatus } from "./subscription";

let _stripe: Stripe | null = null;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes("placeholder")) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!_stripe) {
    _stripe = new Stripe(key, {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

/** Open (billable) subscriptions for a Stripe customer — at most one should exist. */
export async function listOpenSubscriptions(
  customerId: string
): Promise<Stripe.Subscription[]> {
  const stripe = getStripe();
  const open: Stripe.Subscription[] = [];
  for (const status of ["active", "trialing", "past_due", "unpaid"] as const) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 20,
    });
    open.push(...page.data);
  }
  // Dedupe by id (status filters are disjoint, but be safe)
  const byId = new Map(open.map((s) => [s.id, s]));
  return [...byId.values()].sort((a, b) => a.created - b.created);
}

/**
 * If a customer somehow has multiple open subs, keep one and cancel the rest.
 * Prefers `preferSubscriptionId` when it is still open; otherwise the oldest.
 */
export async function enforceSingleOpenSubscription(
  customerId: string,
  preferSubscriptionId?: string | null
): Promise<Stripe.Subscription | null> {
  const open = await listOpenSubscriptions(customerId);
  if (open.length === 0) return null;
  const keep =
    open.find((s) => s.id === preferSubscriptionId) ?? open[0]!;
  const stripe = getStripe();
  for (const sub of open) {
    if (sub.id === keep.id) continue;
    try {
      await stripe.subscriptions.cancel(sub.id);
    } catch (err) {
      console.error("Failed to cancel duplicate subscription", sub.id, err);
    }
  }
  return keep;
}

export const SUBSCRIPTION_PRICE = 19.99; // USD per month (display only — Stripe charges STRIPE_PRICE_ID)
export const SUBSCRIPTION_PRICE_LABEL = "$19.99";
export const SUBSCRIPTION_PRICE_MO = "$19.99/mo";
export const SUBSCRIPTION_ANNUAL_PRICE = 149.99; // display — Stripe charges STRIPE_PRICE_ID_ANNUAL when set
export const SUBSCRIPTION_ANNUAL_LABEL = "$149.99/yr";
/** Effective monthly rate when billed annually (149.99 / 12). */
export const SUBSCRIPTION_ANNUAL_PER_MO = Math.round((SUBSCRIPTION_ANNUAL_PRICE / 12) * 100) / 100;
/** Dollars saved vs 12× monthly. */
export const SUBSCRIPTION_ANNUAL_SAVE_USD = Math.round(
  (SUBSCRIPTION_PRICE * 12 - SUBSCRIPTION_ANNUAL_PRICE) * 100
) / 100;
export const SUBSCRIPTION_ANNUAL_SAVE = `Save $${SUBSCRIPTION_ANNUAL_SAVE_USD}/yr`;
export const SUBSCRIPTION_ANNUAL_PER_MO_LABEL = `$${SUBSCRIPTION_ANNUAL_PER_MO}/mo`;

export type CheckoutPlan = "monthly" | "annual";

export async function createCheckoutSession(
  customerId: string,
  userId: string,
  email: string,
  allowTrial: boolean,
  plan: CheckoutPlan = "monthly"
) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("placeholder")) {
    throw new Error("Stripe is not configured");
  }
  if (!process.env.STRIPE_PRICE_ID) {
    throw new Error("STRIPE_PRICE_ID is not configured");
  }
  const priceId =
    plan === "annual" && process.env.STRIPE_PRICE_ID_ANNUAL
      ? process.env.STRIPE_PRICE_ID_ANNUAL
      : process.env.STRIPE_PRICE_ID!;

  return getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?view=monitor&subscribed=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
    metadata: { userId, plan },
    subscription_data: {
      metadata: { userId, plan },
      ...(allowTrial ? { trial_period_days: 7 } : {}),
    },
    allow_promotion_codes: true,
  });
}

export async function createBillingPortalSession(customerId: string) {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
  });
}

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId?: string | null
) {
  if (existingCustomerId) return existingCustomerId;

  // Reuse an existing Stripe customer with this email (Stripe does not unique emails).
  const listed = await getStripe().customers.list({ email, limit: 5 });
  const match =
    listed.data.find((c) => !c.deleted && c.metadata?.userId === userId) ??
    listed.data.find((c) => !c.deleted);
  if (match) {
    if (!match.metadata?.userId) {
      await getStripe().customers.update(match.id, {
        metadata: { ...match.metadata, userId },
      });
    }
    return match.id;
  }

  const customer = await getStripe().customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}

export { isOpenSubscriptionStatus };
