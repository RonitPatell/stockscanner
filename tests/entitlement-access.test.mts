/**
 * TrustTicker V2 entitlement truth table.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAccessState,
  hasTrustTickerAccess,
  hasActiveSubscription,
  hasPlusAccess,
  hasProAccess,
  resolvePlanTier,
  watchlistLimitFor,
  ENTITLED_ACCESS_STATES,
  type SubscriptionAccess,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");

function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

function expectAccess(
  label: string,
  user: SubscriptionAccess | null,
  state: string,
  entitled: boolean
) {
  test(label, () => {
    assert.equal(resolveAccessState(user, NOW), state);
    assert.equal(hasTrustTickerAccess(user, NOW), entitled);
    assert.equal(
      ENTITLED_ACCESS_STATES.includes(state as (typeof ENTITLED_ACCESS_STATES)[number]),
      entitled
    );
  });
}

expectAccess("anonymous", null, "anonymous", false);

expectAccess(
  "trial eligible",
  {
    subscriptionStatus: "inactive",
    hasUsedTrial: false,
  },
  "trial_eligible",
  false
);

expectAccess(
  "trial day 1",
  {
    subscriptionStatus: "trialing",
    subscriptionEndsAt: daysFromNow(6),
    hasUsedTrial: true,
  },
  "trialing",
  true
);

expectAccess(
  "trial day 7 before exact expiry",
  {
    subscriptionStatus: "trialing",
    subscriptionEndsAt: hoursFromNow(1),
    hasUsedTrial: true,
  },
  "trialing",
  true
);

expectAccess(
  "trial expired",
  {
    subscriptionStatus: "trialing",
    subscriptionEndsAt: hoursFromNow(-1),
    hasUsedTrial: true,
  },
  "expired",
  false
);

expectAccess(
  "active subscription",
  {
    subscriptionStatus: "active",
    subscriptionEndsAt: daysFromNow(20),
    hasUsedTrial: true,
    cancelAtPeriodEnd: false,
  },
  "active",
  true
);

expectAccess(
  "cancel-at-period-end before period end",
  {
    subscriptionStatus: "active",
    subscriptionEndsAt: daysFromNow(10),
    hasUsedTrial: true,
    cancelAtPeriodEnd: true,
  },
  "grace",
  true
);

expectAccess(
  "cancel-at-period-end after period end",
  {
    subscriptionStatus: "active",
    subscriptionEndsAt: hoursFromNow(-1),
    hasUsedTrial: true,
    cancelAtPeriodEnd: true,
  },
  "expired",
  false
);

expectAccess(
  "canceled",
  {
    subscriptionStatus: "canceled",
    hasUsedTrial: true,
    cancelAtPeriodEnd: false,
  },
  "expired",
  false
);

expectAccess(
  "past_due",
  {
    subscriptionStatus: "past_due",
    subscriptionEndsAt: daysFromNow(5),
    hasUsedTrial: true,
  },
  "past_due",
  true
);

expectAccess(
  "unpaid",
  {
    subscriptionStatus: "unpaid",
    hasUsedTrial: true,
  },
  "expired",
  false
);

expectAccess(
  "incomplete",
  {
    subscriptionStatus: "incomplete",
    hasUsedTrial: true,
  },
  "expired",
  false
);

expectAccess(
  "old Plus active subscriber",
  {
    subscriptionStatus: "active",
    subscriptionEndsAt: daysFromNow(15),
    planTier: "plus",
    hasUsedTrial: true,
  },
  "active",
  true
);

expectAccess(
  "old Pro active subscriber",
  {
    subscriptionStatus: "active",
    subscriptionEndsAt: daysFromNow(15),
    planTier: "pro",
    hasUsedTrial: true,
  },
  "active",
  true
);

test("canceled with remaining paid period is grace", () => {
  const user: SubscriptionAccess = {
    subscriptionStatus: "canceled",
    subscriptionEndsAt: daysFromNow(3),
    hasUsedTrial: true,
  };
  assert.equal(resolveAccessState(user, NOW), "grace");
  assert.equal(hasTrustTickerAccess(user, NOW), true);
});

test("deprecated Plus/Pro helpers match hasTrustTickerAccess", () => {
  const plusUser: SubscriptionAccess = {
    subscriptionStatus: "active",
    planTier: "plus",
    subscriptionEndsAt: daysFromNow(10),
  };
  const freeUser: SubscriptionAccess = {
    subscriptionStatus: "inactive",
    hasUsedTrial: true,
  };
  assert.equal(hasPlusAccess(plusUser, NOW), true);
  assert.equal(hasProAccess(plusUser, NOW), true);
  assert.equal(hasPlusAccess(freeUser, NOW), false);
  assert.equal(hasProAccess(freeUser, NOW), false);
});

test("resolvePlanTier maps any entitled user to pro for legacy UI", () => {
  assert.equal(
    resolvePlanTier(
      { subscriptionStatus: "active", planTier: "plus", subscriptionEndsAt: daysFromNow(5) },
      NOW
    ),
    "pro"
  );
  assert.equal(
    resolvePlanTier(
      { subscriptionStatus: "active", planTier: null, subscriptionEndsAt: daysFromNow(5) },
      NOW
    ),
    "pro"
  );
  assert.equal(
    resolvePlanTier({ subscriptionStatus: "inactive", hasUsedTrial: true }, NOW),
    "free"
  );
});

test("watchlist unlimited only when entitled", () => {
  assert.equal(
    watchlistLimitFor(
      { subscriptionStatus: "active", subscriptionEndsAt: daysFromNow(1) },
      NOW
    ),
    Number.POSITIVE_INFINITY
  );
  assert.equal(
    watchlistLimitFor({ subscriptionStatus: "inactive", hasUsedTrial: false }, NOW),
    0
  );
});

test("hasActiveSubscription string shorthand remains compatible", () => {
  assert.equal(hasActiveSubscription("active"), true);
  assert.equal(hasActiveSubscription("trialing"), true);
  assert.equal(hasActiveSubscription("canceled"), false);
  assert.equal(hasActiveSubscription("past_due"), true);
});
