/**
 * TrustTicker V2 entitlements — single product access (trial or paid).
 *
 * Authoritative helpers:
 * - resolveAccessState(user)
 * - hasTrustTickerAccess(user)
 *
 * planTier / Plus / Pro remain for legacy rows and deprecated callers only.
 * They must NOT gate features differently for new product behavior.
 */

export type AccessState =
  | "anonymous"
  | "trial_eligible"
  | "trialing"
  | "active"
  | "grace"
  | "past_due"
  | "expired";

/** @deprecated V2 has one product — kept for analytics / legacy UI labels. */
export type PlanTier = "free" | "plus" | "pro";

export interface SubscriptionAccess {
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
  /** Legacy freemium field — not used for feature gating. */
  planTier?: string | null;
  hasUsedTrial?: boolean | null;
  /** Stripe cancel_at_period_end; when true with active status → grace. */
  cancelAtPeriodEnd?: boolean | null;
}

/** Stripe / DB statuses that mean an open billable subscription (block second checkout). */
export const OPEN_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
] as const;

/**
 * @deprecated No permanent free tier. Retained only so old call sites compile;
 * entitled users have no watchlist cap.
 */
export const FREE_WATCHLIST_LIMIT = 15;

export function isOpenSubscriptionStatus(
  status: string | null | undefined
): boolean {
  return (
    status != null &&
    (OPEN_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
  );
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function endsAtInFuture(
  endsAt: Date | string | null | undefined,
  now: Date
): boolean {
  const end = toDate(endsAt);
  return end != null && end.getTime() > now.getTime();
}

function endsAtInPastOrEqual(
  endsAt: Date | string | null | undefined,
  now: Date
): boolean {
  const end = toDate(endsAt);
  return end != null && end.getTime() <= now.getTime();
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/**
 * Authoritative access-state resolver (server-side).
 * Pass `now` in tests for deterministic expiry edges.
 */
export function resolveAccessState(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): AccessState {
  if (user == null) return "anonymous";

  const status = normalizeStatus(user.subscriptionStatus);
  const cancelAtEnd = Boolean(user.cancelAtPeriodEnd);
  const futureEnd = endsAtInFuture(user.subscriptionEndsAt, now);
  const pastEnd = endsAtInPastOrEqual(user.subscriptionEndsAt, now);

  if (status === "trialing") {
    if (pastEnd) return "expired";
    return "trialing";
  }

  if (status === "active") {
    if (pastEnd) return "expired";
    if (cancelAtEnd) return "grace";
    return "active";
  }

  if (status === "past_due") {
    if (pastEnd) return "expired";
    return "past_due";
  }

  // Terminal / failed payment collection — no access (do not treat as grace via endsAt).
  if (
    status === "unpaid" ||
    status === "incomplete" ||
    status === "incomplete_expired"
  ) {
    if (!user.hasUsedTrial) return "trial_eligible";
    return "expired";
  }

  // Canceled / inactive / empty — paid period may still be open (grace).
  if (futureEnd) {
    return "grace";
  }

  if (
    status === "canceled" ||
    status === "cancelled" ||
    status === "inactive" ||
    status === ""
  ) {
    if (!user.hasUsedTrial) return "trial_eligible";
    return "expired";
  }

  // Unknown status: fail closed unless period still open (already handled).
  if (!user.hasUsedTrial) return "trial_eligible";
  return "expired";
}

/**
 * Authoritative boolean: full TrustTicker Investor OS access.
 * Monthly and annual are identical; legacy Plus/Pro are identical when entitled.
 */
export function hasTrustTickerAccess(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): boolean {
  const state = resolveAccessState(user, now);
  return (
    state === "trialing" ||
    state === "active" ||
    state === "grace" ||
    state === "past_due"
  );
}

/**
 * @deprecated Use hasTrustTickerAccess. Kept for pages/SSE that already call this.
 * Accepts a status string or user-like object.
 */
export function hasActiveSubscription(
  statusOrUser: string | null | undefined | SubscriptionAccess
): boolean {
  if (typeof statusOrUser === "object" && statusOrUser !== null) {
    return hasTrustTickerAccess(statusOrUser);
  }
  if (statusOrUser == null || statusOrUser === "") {
    return hasTrustTickerAccess(null);
  }
  return hasTrustTickerAccess({ subscriptionStatus: statusOrUser });
}

export function normalizePlanTier(raw: string | null | undefined): PlanTier {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "plus" || t === "pro" || t === "free") return t;
  return "free";
}

/**
 * @deprecated V2 single entitlement. Entitled users always map to "pro" so legacy
 * UI that checked planTier === "pro" unlocks fully; non-entitled → "free".
 */
export function resolvePlanTier(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): PlanTier {
  if (!hasTrustTickerAccess(user, now)) return "free";
  return "pro";
}

/**
 * @deprecated Use hasTrustTickerAccess — Plus is not a separate feature tier.
 */
export function hasPlusAccess(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): boolean {
  return hasTrustTickerAccess(user, now);
}

/**
 * @deprecated Use hasTrustTickerAccess — Pro is not a separate feature tier.
 */
export function hasProAccess(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): boolean {
  return hasTrustTickerAccess(user, now);
}

/** Entitled users: unlimited. Others: zero (no permanent free OS tier). */
export function watchlistLimitFor(
  user: SubscriptionAccess | null | undefined,
  now: Date = new Date()
): number {
  return hasTrustTickerAccess(user, now)
    ? Number.POSITIVE_INFINITY
    : 0;
}

export function formatSubscriptionEnd(
  date: Date | string | null | undefined
): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * @deprecated New checkouts should not write Plus/Pro feature splits.
 * Still used by webhooks to label legacy price IDs on the user row.
 */
export function planTierFromCheckoutMeta(meta: {
  tier?: string | null;
  plan?: string | null;
  priceId?: string | null;
}): PlanTier {
  const explicit = normalizePlanTier(meta.tier);
  if (explicit === "plus" || explicit === "pro") return explicit;

  const priceId = meta.priceId ?? "";
  const plusIds = [
    process.env.STRIPE_PRICE_ID_PLUS,
    process.env.STRIPE_PRICE_ID_PLUS_ANNUAL,
  ].filter(Boolean) as string[];
  if (priceId && plusIds.includes(priceId)) return "plus";

  const proIds = [
    process.env.STRIPE_PRICE_ID,
    process.env.STRIPE_PRICE_ID_ANNUAL,
  ].filter(Boolean) as string[];
  if (priceId && proIds.includes(priceId)) return "pro";

  return "pro";
}

/** Access states that include full product capabilities. */
export const ENTITLED_ACCESS_STATES: readonly AccessState[] = [
  "trialing",
  "active",
  "grace",
  "past_due",
] as const;
