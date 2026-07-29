export interface SubscriptionAccess {
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
}

/** Stripe / DB statuses that mean an open billable subscription (block second checkout). */
export const OPEN_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
] as const;

export function isOpenSubscriptionStatus(
  status: string | null | undefined
): boolean {
  return (
    status != null &&
    (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}

/** User keeps scanner access while trialing, active, or until a paid period ends after cancel. */
export function hasActiveSubscription(
  statusOrUser: string | null | undefined | SubscriptionAccess
): boolean {
  const status =
    typeof statusOrUser === "object" && statusOrUser !== null
      ? statusOrUser.subscriptionStatus
      : statusOrUser;
  const endsAt =
    typeof statusOrUser === "object" && statusOrUser !== null
      ? statusOrUser.subscriptionEndsAt
      : null;

  if (status === "active" || status === "trialing") return true;

  if (endsAt) {
    const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
    if (!Number.isNaN(end.getTime()) && end > new Date()) return true;
  }

  return false;
}

export function formatSubscriptionEnd(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
