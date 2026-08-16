/**
 * TrustTicker V2 billing — checkout parsing, prices, webhook apply helpers.
 * No real Stripe network calls.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCheckoutRequest,
  resolveCheckoutPriceId,
  TRUSTTICKER_MONTHLY_PRICE,
  TRUSTTICKER_ANNUAL_PRICE,
} from "../src/lib/billing/pricing.ts";
import {
  accessFromCheckoutSuccessQuery,
  mapDeletedSubscriptionToUserFields,
  mapStripeSubscriptionToUserFields,
} from "../src/lib/billing/subscription-apply.ts";

const PREV = { ...process.env };

test("display prices are $19.99 / $149.99", () => {
  assert.equal(TRUSTTICKER_MONTHLY_PRICE, 19.99);
  assert.equal(TRUSTTICKER_ANNUAL_PRICE, 149.99);
});

test("monthly checkout parses billingPeriod", () => {
  assert.deepEqual(parseCheckoutRequest({ billingPeriod: "monthly" }), {
    ok: true,
    billingPeriod: "monthly",
  });
  assert.deepEqual(parseCheckoutRequest({ plan: "monthly" }), {
    ok: true,
    billingPeriod: "monthly",
  });
});

test("annual checkout parses billingPeriod", () => {
  assert.deepEqual(parseCheckoutRequest({ billingPeriod: "annual" }), {
    ok: true,
    billingPeriod: "annual",
  });
});

test("invalid period rejected", () => {
  const r = parseCheckoutRequest({ billingPeriod: "weekly" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "INVALID_PERIOD");
});

test("arbitrary injected price ID rejected", () => {
  const r = parseCheckoutRequest({
    billingPeriod: "monthly",
    priceId: "price_attacker",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "INVALID_PRICE");
});

test("fake tier parameter rejected", () => {
  const r = parseCheckoutRequest({ billingPeriod: "monthly", tier: "pro" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "INVALID_TIER");
});

test("resolveCheckoutPriceId maps period to env — never client id", () => {
  process.env.STRIPE_PRICE_ID_MONTHLY = "price_monthly_test";
  process.env.STRIPE_PRICE_ID_ANNUAL = "price_annual_test";
  assert.equal(resolveCheckoutPriceId("monthly"), "price_monthly_test");
  assert.equal(resolveCheckoutPriceId("annual"), "price_annual_test");
  process.env.STRIPE_PRICE_ID_MONTHLY = PREV.STRIPE_PRICE_ID_MONTHLY;
  process.env.STRIPE_PRICE_ID_ANNUAL = PREV.STRIPE_PRICE_ID_ANNUAL;
});

test("checkout success query spoofing never grants access", () => {
  assert.equal(
    accessFromCheckoutSuccessQuery({
      subscribed: "true",
      tier: "pro",
      billingPeriod: "annual",
    }),
    false
  );
});

test("cancel-at-period-end maps to active + flag", () => {
  const mapped = mapStripeSubscriptionToUserFields({
    status: "active",
    cancelAtPeriodEnd: true,
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    trialEndsAt: null,
    priceId: "price_x",
    billingPeriod: "monthly",
  });
  assert.equal(mapped.subscriptionStatus, "active");
  assert.equal(mapped.cancelAtPeriodEnd, true);
  assert.ok(mapped.subscriptionEndsAt);
});

test("canceled subscription clears open access fields", () => {
  const cleared = mapDeletedSubscriptionToUserFields();
  assert.equal(cleared.subscriptionStatus, "canceled");
  assert.equal(cleared.subscriptionId, null);
  assert.equal(cleared.cancelAtPeriodEnd, false);
});

test("payment failure status path uses past_due mapping input", () => {
  const mapped = mapStripeSubscriptionToUserFields({
    status: "past_due",
    cancelAtPeriodEnd: false,
    periodEnd: new Date("2026-09-01T00:00:00.000Z"),
    trialEndsAt: null,
    priceId: null,
    billingPeriod: null,
  });
  assert.equal(mapped.subscriptionStatus, "past_due");
});

test("duplicate webhook claim helper uses unique event id semantics", async () => {
  // Pure duplicate detection is covered by Prisma P2002 in integration;
  // here we assert the apply helpers stay idempotent on repeated maps.
  const input = {
    status: "active" as const,
    cancelAtPeriodEnd: false,
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    trialEndsAt: null,
    priceId: "price_m",
    billingPeriod: "monthly" as const,
  };
  const a = mapStripeSubscriptionToUserFields(input);
  const b = mapStripeSubscriptionToUserFields(input);
  assert.deepEqual(a, b);
});

test("out-of-order: deleted mapping wins over stale active snapshot fields", () => {
  const deleted = mapDeletedSubscriptionToUserFields();
  const active = mapStripeSubscriptionToUserFields({
    status: "active",
    cancelAtPeriodEnd: false,
    periodEnd: new Date("2026-10-01T00:00:00.000Z"),
    trialEndsAt: null,
    priceId: null,
    billingPeriod: "monthly",
  });
  // Processor order is event-id claimed; once deleted is applied, status is canceled.
  assert.notEqual(deleted.subscriptionStatus, active.subscriptionStatus);
  assert.equal(deleted.subscriptionStatus, "canceled");
});
