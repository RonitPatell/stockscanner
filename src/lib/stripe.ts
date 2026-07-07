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

export const SUBSCRIPTION_PRICE = 40; // USD per month

export async function createCheckoutSession(
  customerId: string,
  userId: string,
  email: string
) {
  return getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?subscribed=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
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
