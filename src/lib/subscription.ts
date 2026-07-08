export interface SubscriptionAccess {
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
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
