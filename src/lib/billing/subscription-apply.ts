/**
 * Apply Stripe subscription state to a User row — pure-ish helpers for tests + webhook.
 */

export type SubscriptionApplyInput = {
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: Date | null;
  trialEndsAt: Date | null;
  priceId: string | null;
  billingPeriod: "monthly" | "annual" | null;
};

export type SubscriptionApplyResult = {
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  subscriptionEndsAt: Date | null;
  /** Legacy label column — always "pro" for entitled paid/trial for UI compat. */
  planTier: string;
};

export function mapStripeSubscriptionToUserFields(
  input: SubscriptionApplyInput
): SubscriptionApplyResult {
  const status =
    input.status === "trialing"
      ? "trialing"
      : input.cancelAtPeriodEnd && input.status === "active"
        ? "active"
        : input.status;

  let subscriptionEndsAt: Date | null = input.periodEnd;
  if (status === "trialing" && input.trialEndsAt) {
    subscriptionEndsAt = input.trialEndsAt;
  }

  return {
    subscriptionStatus: status,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    subscriptionEndsAt,
    planTier: "pro",
  };
}

export function mapDeletedSubscriptionToUserFields(): {
  subscriptionStatus: "canceled";
  subscriptionId: null;
  planTier: "free";
  cancelAtPeriodEnd: false;
} {
  return {
    subscriptionStatus: "canceled",
    subscriptionId: null,
    planTier: "free",
    cancelAtPeriodEnd: false,
  };
}

/** Checkout success query params must never grant access. */
export function accessFromCheckoutSuccessQuery(params: {
  subscribed?: string | null;
  tier?: string | null;
  billingPeriod?: string | null;
}): boolean {
  void params;
  return false;
}
