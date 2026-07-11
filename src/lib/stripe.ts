import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
      apiVersion: "2026-06-24.dahlia",
      typescript: true,
    });
  }
  return _stripe;
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
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscribed=true`,
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

  const customer = await getStripe().customers.create({
    email,
    metadata: { userId },
  });
  return customer.id;
}
