import { hasActiveSubscription } from "./subscription";

export type SubscriptionSettings = {
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: string | Date | null;
};

/** Client-side check using /api/settings payload (includes canceled-but-still-active). */
export function isSubscribedFromSettings(
  data: SubscriptionSettings | null | undefined
): boolean {
  if (!data) return false;
  return hasActiveSubscription({
    subscriptionStatus: data.subscriptionStatus,
    subscriptionEndsAt: data.subscriptionEndsAt,
  });
}
