/**
 * 7-day trial hardening — windows, display, eligibility, race slot.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  TRIAL_DURATION_DAYS,
  TRIAL_DURATION_MS,
  computeTrialWindow,
  evaluateTrialEligibility,
  getTrialAccessDisplay,
  hasConsumedTrial,
  isAccountTrialEligible,
  tryClaimTrialSlot,
} from "../src/lib/trial.ts";
import {
  hasTrustTickerAccess,
  resolveAccessState,
} from "../src/lib/subscription.ts";

const NOW = new Date("2026-08-16T12:00:00.000Z");

test("trial duration is exactly 7 days", () => {
  assert.equal(TRIAL_DURATION_DAYS, 7);
  const { startedAt, endsAt } = computeTrialWindow(NOW);
  assert.equal(endsAt.getTime() - startedAt.getTime(), TRIAL_DURATION_MS);
  assert.equal(startedAt.toISOString(), NOW.toISOString());
});

test("trial starts once — second claim on same slot fails", () => {
  const slot = { hasUsedTrial: false, trialConsumedAt: null as Date | null };
  assert.equal(tryClaimTrialSlot(slot), true);
  assert.equal(tryClaimTrialSlot(slot), false);
  assert.equal(slot.hasUsedTrial, true);
  assert.ok(slot.trialConsumedAt);
});

test("multiple simultaneous activation attempts — only one winner", () => {
  const slot = { hasUsedTrial: false, trialConsumedAt: null as Date | null };
  const results = Array.from({ length: 20 }, () => tryClaimTrialSlot(slot));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter((r) => !r).length, 19);
});

test("expired trial has no TrustTicker access", () => {
  const user = {
    subscriptionStatus: "trialing",
    hasUsedTrial: true,
    trialConsumedAt: new Date(NOW.getTime() - TRIAL_DURATION_MS),
    trialStartedAt: new Date(NOW.getTime() - TRIAL_DURATION_MS),
    trialEndsAt: new Date(NOW.getTime() - 1),
  };
  assert.equal(resolveAccessState(user, NOW), "expired");
  assert.equal(hasTrustTickerAccess(user, NOW), false);
  assert.equal(getTrialAccessDisplay(user, NOW).label, "Trial expired");
});

test("manually manipulated client timestamp is ignored", () => {
  const serverUser = {
    subscriptionStatus: "trialing",
    hasUsedTrial: true,
    trialConsumedAt: NOW,
    trialStartedAt: NOW,
    trialEndsAt: new Date(NOW.getTime() + TRIAL_DURATION_MS),
  };
  // Junk client-only fields must not be read by the resolver.
  const forged = {
    ...serverUser,
    clientTrialEndsAt: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
  } as typeof serverUser & { clientTrialEndsAt: Date };
  assert.equal(resolveAccessState(forged, NOW), "trialing");
  assert.equal(hasTrustTickerAccess(forged, NOW), true);
  const after = new Date(NOW.getTime() + TRIAL_DURATION_MS + 1000);
  assert.equal(resolveAccessState(forged, after), "expired");
  assert.equal(hasTrustTickerAccess(forged, after), false);
});

test("user logs out/in during trial — same DB row keeps access", () => {
  const row = {
    subscriptionStatus: "trialing",
    hasUsedTrial: true,
    trialConsumedAt: NOW,
    trialStartedAt: NOW,
    trialEndsAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
  };
  assert.equal(hasTrustTickerAccess(row, NOW), true);
  // Simulate new session loading the same row
  assert.equal(hasTrustTickerAccess({ ...row }, NOW), true);
  assert.match(getTrialAccessDisplay(row, NOW).label ?? "", /Trial ends/);
});

test("subscription begins during trial → active paid access", () => {
  const user = {
    subscriptionStatus: "active",
    hasUsedTrial: true,
    trialConsumedAt: NOW,
    trialStartedAt: NOW,
    trialEndsAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
    subscriptionEndsAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
  };
  assert.equal(resolveAccessState(user, NOW), "active");
  assert.equal(hasTrustTickerAccess(user, NOW), true);
  // Trial banner suppressed once paid
  assert.equal(getTrialAccessDisplay(user, NOW).kind, "none");
});

test("subscription begins after expiration → active; trial not restarted", () => {
  const user = {
    subscriptionStatus: "active",
    hasUsedTrial: true,
    trialConsumedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
    trialStartedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
    trialEndsAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    subscriptionEndsAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
  };
  assert.equal(hasConsumedTrial(user), true);
  assert.equal(isAccountTrialEligible(user), false);
  assert.equal(resolveAccessState(user, NOW), "active");
  assert.equal(hasTrustTickerAccess(user, NOW), true);
});

test("old trial claim records block eligibility", () => {
  const freshAccount = {
    subscriptionStatus: "inactive",
    hasUsedTrial: false,
    trialConsumedAt: null,
  };
  assert.equal(
    evaluateTrialEligibility({
      user: freshAccount,
      durableClaimExists: true,
    }).eligible,
    false
  );
  assert.equal(
    evaluateTrialEligibility({
      user: freshAccount,
      durableClaimExists: false,
    }).eligible,
    true
  );
});

test("trial does not reset after cancellation", () => {
  const afterCancel = {
    subscriptionStatus: "canceled",
    subscriptionId: null,
    hasUsedTrial: true,
    trialConsumedAt: NOW,
    trialStartedAt: NOW,
    trialEndsAt: new Date(NOW.getTime() + TRIAL_DURATION_MS),
    cancelAtPeriodEnd: false,
  };
  // Still inside original trial window → access continues (grace/trialing via trialEndsAt)
  assert.equal(resolveAccessState(afterCancel, NOW), "trialing");
  assert.equal(hasTrustTickerAccess(afterCancel, NOW), true);
  assert.equal(isAccountTrialEligible(afterCancel), false);

  const afterWindow = {
    ...afterCancel,
    trialEndsAt: new Date(NOW.getTime() - 1000),
  };
  assert.equal(resolveAccessState(afterWindow, NOW), "expired");
  assert.equal(isAccountTrialEligible(afterWindow), false);
});

test("display: Trial ends in X days / today / expired", () => {
  const base = {
    subscriptionStatus: "trialing",
    hasUsedTrial: true,
    trialConsumedAt: NOW,
    trialStartedAt: NOW,
  };
  const in3 = {
    ...base,
    trialEndsAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000),
  };
  assert.equal(getTrialAccessDisplay(in3, NOW).label, "Trial ends in 3 days");

  const today = {
    ...base,
    trialEndsAt: new Date(Date.UTC(2026, 7, 16, 23, 0, 0)), // same UTC day as NOW
  };
  assert.equal(getTrialAccessDisplay(today, NOW).label, "Trial ends today");

  const expired = {
    ...base,
    trialEndsAt: new Date(NOW.getTime() - 1000),
  };
  assert.equal(getTrialAccessDisplay(expired, NOW).label, "Trial expired");
});

test("trial day 1 and day 7 before exact expiry keep access", () => {
  const start = NOW;
  const end = new Date(start.getTime() + TRIAL_DURATION_MS);
  const day1 = {
    subscriptionStatus: "trialing",
    hasUsedTrial: true,
    trialConsumedAt: start,
    trialStartedAt: start,
    trialEndsAt: end,
  };
  assert.equal(hasTrustTickerAccess(day1, start), true);
  const almostEnd = new Date(end.getTime() - 1);
  assert.equal(hasTrustTickerAccess(day1, almostEnd), true);
  assert.equal(hasTrustTickerAccess(day1, end), false);
});
