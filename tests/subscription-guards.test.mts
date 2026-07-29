/**
 * Subscription open-status guards used to block duplicate Stripe checkouts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  isOpenSubscriptionStatus,
  hasActiveSubscription,
  OPEN_SUBSCRIPTION_STATUSES,
} from "../src/lib/subscription.ts";

test("open statuses include active/trialing/past_due/unpaid", () => {
  assert.ok(OPEN_SUBSCRIPTION_STATUSES.includes("active"));
  assert.ok(OPEN_SUBSCRIPTION_STATUSES.includes("trialing"));
  assert.ok(OPEN_SUBSCRIPTION_STATUSES.includes("past_due"));
  assert.ok(OPEN_SUBSCRIPTION_STATUSES.includes("unpaid"));
});

test("isOpenSubscriptionStatus blocks second checkout cases", () => {
  assert.equal(isOpenSubscriptionStatus("active"), true);
  assert.equal(isOpenSubscriptionStatus("trialing"), true);
  assert.equal(isOpenSubscriptionStatus("past_due"), true);
  assert.equal(isOpenSubscriptionStatus("unpaid"), true);
  assert.equal(isOpenSubscriptionStatus("canceled"), false);
  assert.equal(isOpenSubscriptionStatus("incomplete"), false);
  assert.equal(isOpenSubscriptionStatus(null), false);
});

test("hasActiveSubscription still grants access on active/trialing", () => {
  assert.equal(hasActiveSubscription("active"), true);
  assert.equal(hasActiveSubscription("trialing"), true);
  assert.equal(hasActiveSubscription("canceled"), false);
});
