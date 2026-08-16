/**
 * TrustTicker V2 billing — single product, monthly | annual.
 *
 * Trial behavior (unchanged): Checkout uses `payment_method_types: ["card"]` and
 * `subscription_data.trial_period_days: 7` when eligible. Stripe Checkout in
 * subscription mode collects a payment method up front; the card is not charged
 * until the trial ends (unless the customer is ineligible for trial).
 *
 * Access is never granted from `?subscribed=true` — webhooks + DB only.
 */

export type BillingPeriod = "monthly" | "annual";

/** Display amounts (USD) — not charged amounts from Stripe Price objects. */
export const TRUSTTICKER_MONTHLY_PRICE = 19.99;
export const TRUSTTICKER_ANNUAL_PRICE = 149.99;
export const TRUSTTICKER_MONTHLY_LABEL = "$19.99";
export const TRUSTTICKER_MONTHLY_MO = "$19.99/mo";
export const TRUSTTICKER_ANNUAL_LABEL = "$149.99/yr";
export const TRUSTTICKER_ANNUAL_PER_MO =
  Math.round((TRUSTTICKER_ANNUAL_PRICE / 12) * 100) / 100;
export const TRUSTTICKER_ANNUAL_PER_MO_LABEL = `$${TRUSTTICKER_ANNUAL_PER_MO}/mo`;
export const TRUSTTICKER_ANNUAL_SAVE_USD =
  Math.round((TRUSTTICKER_MONTHLY_PRICE * 12 - TRUSTTICKER_ANNUAL_PRICE) * 100) /
  100;

/** @deprecated Alias — use TRUSTTICKER_* */
export const SUBSCRIPTION_PRICE = TRUSTTICKER_MONTHLY_PRICE;
export const SUBSCRIPTION_PRICE_LABEL = TRUSTTICKER_MONTHLY_LABEL;
export const SUBSCRIPTION_PRICE_MO = TRUSTTICKER_MONTHLY_MO;
export const SUBSCRIPTION_ANNUAL_PRICE = TRUSTTICKER_ANNUAL_PRICE;
export const SUBSCRIPTION_ANNUAL_LABEL = TRUSTTICKER_ANNUAL_LABEL;
export const SUBSCRIPTION_ANNUAL_PER_MO = TRUSTTICKER_ANNUAL_PER_MO;
export const SUBSCRIPTION_ANNUAL_PER_MO_LABEL = TRUSTTICKER_ANNUAL_PER_MO_LABEL;
export const SUBSCRIPTION_ANNUAL_SAVE_USD = TRUSTTICKER_ANNUAL_SAVE_USD;
export const SUBSCRIPTION_ANNUAL_SAVE = `Save $${TRUSTTICKER_ANNUAL_SAVE_USD}/yr`;

/**
 * Resolve Stripe Price ID for NEW checkouts only.
 * Canonical: STRIPE_PRICE_ID_MONTHLY / STRIPE_PRICE_ID_ANNUAL
 *
 * @deprecated Temporary fallbacks (migration only — remove when all envs migrated):
 * STRIPE_PRICE_ID, STRIPE_PRICE_ID_PLUS, STRIPE_PRICE_ID_PLUS_ANNUAL
 */
export function resolveCheckoutPriceId(period: BillingPeriod): string {
  if (period === "annual") {
    const id =
      process.env.STRIPE_PRICE_ID_ANNUAL ||
      // @deprecated migration fallback
      process.env.STRIPE_PRICE_ID_PLUS_ANNUAL;
    if (!id) {
      throw new Error("STRIPE_PRICE_ID_ANNUAL is not configured");
    }
    return id;
  }
  const id =
    process.env.STRIPE_PRICE_ID_MONTHLY ||
    // @deprecated migration fallbacks
    process.env.STRIPE_PRICE_ID ||
    process.env.STRIPE_PRICE_ID_PLUS;
  if (!id) {
    throw new Error("STRIPE_PRICE_ID_MONTHLY is not configured");
  }
  return id;
}

/** All known paid price IDs (new + legacy) — classify existing subs as entitled. */
export function listKnownPaidPriceIds(): string[] {
  return [
    process.env.STRIPE_PRICE_ID_MONTHLY,
    process.env.STRIPE_PRICE_ID_ANNUAL,
    // @deprecated legacy / migration
    process.env.STRIPE_PRICE_ID,
    process.env.STRIPE_PRICE_ID_PLUS,
    process.env.STRIPE_PRICE_ID_PLUS_ANNUAL,
    process.env.STRIPE_PRICE_ID_PRO,
    process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
  ].filter((v): v is string => Boolean(v));
}

export function isKnownPaidPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return listKnownPaidPriceIds().includes(priceId);
}

/**
 * Parse checkout body. Accepts billingPeriod or legacy `plan`.
 * Rejects client price IDs and feature tiers.
 */
export function parseCheckoutRequest(body: unknown):
  | { ok: true; billingPeriod: BillingPeriod }
  | { ok: false; error: string; code: string } {
  const raw =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (raw.priceId != null || raw.price_id != null || raw.stripePriceId != null) {
    return {
      ok: false,
      error: "Client-supplied price IDs are not allowed",
      code: "INVALID_PRICE",
    };
  }

  if (raw.tier != null) {
    return {
      ok: false,
      error: "Feature tiers are not used. Choose monthly or annual billing.",
      code: "INVALID_TIER",
    };
  }

  const periodRaw = raw.billingPeriod ?? raw.plan;
  if (periodRaw == null) {
    return { ok: true, billingPeriod: "monthly" };
  }
  if (periodRaw === "annual" || periodRaw === "yearly") {
    return { ok: true, billingPeriod: "annual" };
  }
  if (periodRaw === "monthly" || periodRaw === "month") {
    return { ok: true, billingPeriod: "monthly" };
  }

  return {
    ok: false,
    error: 'billingPeriod must be "monthly" or "annual"',
    code: "INVALID_PERIOD",
  };
}
