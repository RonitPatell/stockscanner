import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAnalyticsPrivacy,
  isFunnelEvent,
  FUNNEL_EVENTS,
  track,
  getFunnelEventCounts,
} from "../src/lib/analytics/track.ts";
import {
  computeActivation,
  onboardingChecklistItems,
  parseOnboardingProgress,
  FOCUS_STARTER_WATCHLISTS,
  ALERT_STYLE_PRESETS,
} from "../src/lib/onboarding.ts";
import {
  hashEmailForTrialClaim,
  hashPhoneForTrialClaim,
} from "../src/lib/trial-claims.ts";
import { validateRegisterInput } from "../src/lib/register-validation.ts";

// Re-export scrub via asserting track privacy — track.ts doesn't export scrubProps.
// We test assertAnalyticsPrivacy + event allowlist instead.

test("funnel events include required signup funnel names", () => {
  const required = [
    "landing_view",
    "landing_cta_replay",
    "landing_cta_trial",
    "landing_case_study_click",
    "demo_view",
    "pricing_view",
    "signup_started",
    "signup_completed",
    "checkout_started",
    "trial_started",
    "onboarding_step_completed",
    "activation_completed",
    "first_alert_delivered",
    "day_2_return",
    "day_5_return",
    "paid_conversion",
    "cancellation",
    "cancellation_reason",
  ];
  for (const e of required) {
    assert.equal(isFunnelEvent(e), true, e);
  }
  assert.equal(FUNNEL_EVENTS.length, required.length);
});

test("analytics privacy rejects email phone webhook watchlist keys", () => {
  assert.throws(() => assertAnalyticsPrivacy({ email: "a@b.com" }));
  assert.throws(() => assertAnalyticsPrivacy({ phoneNumber: "+15551212" }));
  assert.throws(() => assertAnalyticsPrivacy({ discordWebhook: "https://discord.com/api/webhooks/x" }));
  assert.throws(() => assertAnalyticsPrivacy({ watchlist: ["AAPL"] }));
  assert.throws(() => assertAnalyticsPrivacy({ props: { email: "x@y.z" } }));
  assert.doesNotThrow(() =>
    assertAnalyticsPrivacy({ event: "landing_view", props: { step: 1 } })
  );
});

test("activation requires 5 symbols, channel, 3 expands, test alert", () => {
  const incomplete = computeActivation({
    watchlist: ["A", "B", "C", "D"],
    emailAlertsEnabled: true,
    catalystsExpandedCount: 2,
    testAlertSentAt: null,
  });
  assert.equal(incomplete.activated, false);
  assert.ok(incomplete.missing.length >= 2);

  const done = computeActivation({
    watchlist: ["AAPL", "MSFT", "NVDA", "AMD", "SOFI"],
    emailAlertsEnabled: true,
    catalystsExpandedCount: 3,
    testAlertSentAt: new Date(),
  });
  assert.equal(done.activated, true);
  assert.equal(done.missing.length, 0);
});

test("activation honors activatedAt even if counts drift", () => {
  const state = computeActivation({
    watchlist: [],
    activatedAt: new Date(),
  });
  assert.equal(state.activated, true);
});

test("starter watchlists have at least 5 symbols", () => {
  for (const [k, list] of Object.entries(FOCUS_STARTER_WATCHLISTS)) {
    assert.ok(list.length >= 5, k);
  }
});

test("alert style presets cover early confirmed risk_only", () => {
  assert.ok(ALERT_STYLE_PRESETS.early);
  assert.ok(ALERT_STYLE_PRESETS.confirmed);
  assert.ok(ALERT_STYLE_PRESETS.risk_only);
});

test("onboarding checklist reflects progress", () => {
  const items = onboardingChecklistItems(
    parseOnboardingProgress({
      focusDone: true,
      watchlistDone: false,
      alertsDone: true,
      testAlertDone: false,
    })
  );
  assert.equal(items.find((i) => i.id === "focus")?.done, true);
  assert.equal(items.find((i) => i.id === "watchlist")?.done, false);
  assert.equal(items.find((i) => i.id === "alerts")?.done, false);
});

test("trial claim hashes are stable and not reversible plaintext", () => {
  const a = hashEmailForTrialClaim("Trader@Example.com");
  const b = hashEmailForTrialClaim("trader@example.com");
  assert.equal(a, b);
  assert.equal(a.includes("@"), false);
  assert.equal(a.length, 64);

  const p = hashPhoneForTrialClaim("+1 (555) 000-1111");
  const p2 = hashPhoneForTrialClaim("15550001111");
  assert.equal(p, p2);
  assert.equal(p.includes("555"), false);
});

test("scrubTrackProps drops banned keys and email-like values", async () => {
  const { scrubTrackProps } = await import("../src/lib/analytics/track.ts");
  const scrubbed = scrubTrackProps({
    step: 2,
    email: "a@b.com",
    phoneNumber: "15551234567",
    watchlist: "AAPL,MSFT" as unknown as string,
    style: "confirmed",
  });
  assert.equal("email" in scrubbed, false);
  assert.equal("phoneNumber" in scrubbed, false);
  assert.equal("watchlist" in scrubbed, false);
  assert.equal(scrubbed.step, 2);
  assert.equal(scrubbed.style, "confirmed");
});

test("track scrubs PII-like prop values and still increments", async () => {
  const before = await getFunnelEventCounts();
  await track("onboarding_step_completed", {
    step: 1,
    email: "should-be-dropped@x.com",
    note: "ok-label",
  });
  const after = await getFunnelEventCounts();
  assert.equal(
    after.onboarding_step_completed,
    (before.onboarding_step_completed ?? 0) + 1
  );
});

test("registration accepts email+password and optional name; rejects phone", () => {
  const ok = validateRegisterInput({
    email: "Trader@Example.com",
    password: "password1",
    name: "Alex",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.email, "trader@example.com");
    assert.equal(ok.name, "Alex");
  }

  const noName = validateRegisterInput({
    email: "a@b.co",
    password: "password1",
  });
  assert.equal(noName.ok, true);
  if (noName.ok) assert.equal(noName.name, undefined);

  const withPhone = validateRegisterInput({
    email: "a@b.co",
    password: "password1",
    phoneNumber: "+15551234567",
  });
  assert.equal(withPhone.ok, false);
  if (!withPhone.ok) assert.equal(withPhone.status, 400);
});
