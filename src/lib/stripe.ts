import Stripe from "stripe";
import {
  resolveCheckoutPriceId,
  type BillingPeriod,
  TRUSTTICKER_MONTHLY_PRICE,
  TRUSTTICKER_MONTHLY_LABEL,
  TRUSTTICKER_MONTHLY_MO,
  TRUSTTICKER_ANNUAL_PRICE,
  TRUSTTICKER_ANNUAL_LABEL,
  TRUSTTICKER_ANNUAL_PER_MO,
  TRUSTTICKER_ANNUAL_PER_MO_LABEL,
  TRUSTTICKER_ANNUAL_SAVE_USD,
  SUBSCRIPTION_PRICE,
  SUBSCRIPTION_PRICE_LABEL,
  SUBSCRIPTION_PRICE_MO,
  SUBSCRIPTION_ANNUAL_PRICE,
  SUBSCRIPTION_ANNUAL_LABEL,
  SUBSCRIPTION_ANNUAL_PER_MO,
  SUBSCRIPTION_ANNUAL_PER_MO_LABEL,
  SUBSCRIPTION_ANNUAL_SAVE_USD,
  SUBSCRIPTION_ANNUAL_SAVE,
} from "./billing/pricing";
import { isOpenSubscriptionStatus, type PlanTier } from "./subscription";

export type { BillingPeriod };
export type CheckoutInterval = BillingPeriod;
/** @deprecated Feature tiers removed — kept so old imports compile. */
export type CheckoutTier = "plus" | "pro";
/** @deprecated Use BillingPeriod / CheckoutInterval */
export type CheckoutPlan = BillingPeriod;

export {
  TRUSTTICKER_MONTHLY_PRICE,
  TRUSTTICKER_MONTHLY_LABEL,
  TRUSTTICKER_MONTHLY_MO,
  TRUSTTICKER_ANNUAL_PRICE,
  TRUSTTICKER_ANNUAL_LABEL,
  TRUSTTICKER_ANNUAL_PER_MO,
  TRUSTTICKER_ANNUAL_PER_MO_LABEL,
  TRUSTTICKER_ANNUAL_SAVE_USD,
  SUBSCRIPTION_PRICE,
  SUBSCRIPTION_PRICE_LABEL,
  SUBSCRIPTION_PRICE_MO,
  SUBSCRIPTION_ANNUAL_PRICE,
  SUBSCRIPTION_ANNUAL_LABEL,
  SUBSCRIPTION_ANNUAL_PER_MO,
  SUBSCRIPTION_ANNUAL_PER_MO_LABEL,
  SUBSCRIPTION_ANNUAL_SAVE_USD,
  SUBSCRIPTION_ANNUAL_SAVE,
};

/** @deprecated Use TRUSTTICKER_MONTHLY_* */
export const PLUS_PRICE = TRUSTTICKER_MONTHLY_PRICE;
export const PLUS_PRICE_LABEL = TRUSTTICKER_MONTHLY_LABEL;
export const PLUS_PRICE_MO = TRUSTTICKER_MONTHLY_MO;
export const PLUS_ANNUAL_PRICE = TRUSTTICKER_ANNUAL_PRICE;
export const PLUS_ANNUAL_LABEL = TRUSTTICKER_ANNUAL_LABEL;
export const PLUS_ANNUAL_PER_MO = TRUSTTICKER_ANNUAL_PER_MO;
export const PLUS_ANNUAL_SAVE_USD = TRUSTTICKER_ANNUAL_SAVE_USD;

/** @deprecated Use TRUSTTICKER_MONTHLY_* — Pro tier removed */
export const PRO_PRICE = TRUSTTICKER_MONTHLY_PRICE;
export const PRO_PRICE_LABEL = TRUSTTICKER_MONTHLY_LABEL;
export const PRO_PRICE_MO = TRUSTTICKER_MONTHLY_MO;
export const PRO_ANNUAL_PRICE = TRUSTTICKER_ANNUAL_PRICE;
export const PRO_ANNUAL_LABEL = TRUSTTICKER_ANNUAL_LABEL;
export const PRO_ANNUAL_PER_MO = TRUSTTICKER_ANNUAL_PER_MO;
export const PRO_ANNUAL_PER_MO_LABEL = TRUSTTICKER_ANNUAL_PER_MO_LABEL;
export const PRO_ANNUAL_SAVE_USD = TRUSTTICKER_ANNUAL_SAVE_USD;

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
  const byId = new Map(open.map((s) => [s.id, s]));
  return [...byId.values()].sort((a, b) => a.created - b.created);
}

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

/**
 * Create Checkout for TrustTicker monthly|annual.
 * Requires a card on file for trial (Stripe subscription Checkout default).
 * Metadata: userId + billingPeriod only — no feature tier.
 */
export async function createCheckoutSession(
  customerId: string,
  userId: string,
  email: string,
  allowTrial: boolean,
  billingPeriod: BillingPeriod = "monthly"
) {
  if (
    !process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY.includes("placeholder")
  ) {
    throw new Error("Stripe is not configured");
  }

  const priceId = resolveCheckoutPriceId(billingPeriod);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
    // Display-only query params — never used for entitlement.
    success_url: `${appUrl}/dashboard?view=portfolio&subscribed=true&billingPeriod=${billingPeriod}`,
    cancel_url: `${appUrl}/pricing?canceled=true`,
    metadata: { userId, billingPeriod },
    subscription_data: {
      metadata: { userId, billingPeriod },
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

export type { PlanTier };
export { isOpenSubscriptionStatus, resolveCheckoutPriceId };
