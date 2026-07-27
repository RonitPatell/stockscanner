import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoPrivateFields,
  toPublicDemoRecord,
  redactCuratedIfNeeded,
} from "../src/lib/demo/sanitize.ts";
import {
  isRedistributionPermitted,
  mustRedactLicensedText,
} from "../src/lib/demo/licensing.ts";
import { isDemoAnalyticsEvent } from "../src/lib/demo/analytics.ts";
import type { PublicDemoRecord } from "../src/lib/demo/types.ts";

test("SEC and issuer wires are redistribution-permitted", () => {
  assert.equal(isRedistributionPermitted("SEC EDGAR"), true);
  assert.equal(isRedistributionPermitted("GlobeNewswire"), true);
  assert.equal(isRedistributionPermitted("Business Wire"), true);
  assert.equal(isRedistributionPermitted("PR Newswire"), true);
});

test("editorial / licensed sources must redact body text", () => {
  assert.equal(mustRedactLicensedText("Benzinga"), true);
  assert.equal(mustRedactLicensedText("Finnhub"), true);
  assert.equal(mustRedactLicensedText("MarketWatch"), true);
  assert.equal(mustRedactLicensedText("CNBC"), true);
  assert.equal(mustRedactLicensedText("Benzinga API"), true);
  assert.equal(mustRedactLicensedText("SEC EDGAR"), false);
});

test("public record never includes private or webhook fields", () => {
  const record = toPublicDemoRecord(
    {
      id: "c1",
      symbol: "AAPL",
      headline: "8-K Filing: Material agreement",
      source: "SEC EDGAR",
      sourceUrl: "https://www.sec.gov/example",
      publishedAt: new Date("2026-07-20T14:00:00.000Z"),
      createdAt: new Date("2026-07-20T14:00:08.000Z"),
      catalystType: "sec_filing",
      aiSummary: "Material agreement disclosed.",
      keyPoints: ["Item 1.01"],
      setupTags: [],
      price: 190,
      changePercent: 1.2,
      floatShares: 15e9,
      marketCap: 3e12,
      urgencyScore: 70,
      verifiedConfidence: 80,
      sourceTier: "wire",
      isPremarket: false,
    },
    "DELAYED_REAL"
  );

  assertNoPrivateFields(record);
  assert.equal(record.textRedacted, false);
  assert.ok(record.publishedAt);
  assert.ok(record.ingestedAt);
  assert.ok(record.guided.whatHappened);
  assert.equal(
    "discordWebhook" in record || "phoneNumber" in record || "userId" in record,
    false
  );
});

test("licensed source public record redacts free text posture", () => {
  const record = toPublicDemoRecord(
    {
      id: "c2",
      symbol: "NVDA",
      headline: "Analyst note on AI demand",
      source: "Benzinga",
      sourceUrl: "https://www.benzinga.com/example",
      publishedAt: new Date("2026-07-20T15:00:00.000Z"),
      createdAt: new Date("2026-07-20T15:00:20.000Z"),
      catalystType: "upgrade",
      aiSummary: "Exclusive color from the desk that must not ship publicly.",
      keyPoints: ["Exclusive color from the desk that must not ship publicly."],
      setupTags: [],
      price: 120,
      changePercent: 2,
      floatShares: null,
      marketCap: null,
      urgencyScore: 40,
      verifiedConfidence: 50,
      sourceTier: "aggregator",
      isPremarket: false,
    },
    "DELAYED_REAL"
  );

  assert.equal(record.textRedacted, true);
  assert.equal(record.redistributionPermitted, false);
  assert.ok(!record.evidence.some((e) => /Exclusive color/i.test(e)));
  assertNoPrivateFields(record);
});

test("curated redact helper strips risky evidence lines", () => {
  const base: PublicDemoRecord = {
    id: "x",
    mode: "CURATED_CASES",
    symbol: "AMD",
    headline: "Headline",
    source: "CNBC",
    sourceUrl: "https://www.cnbc.com/x",
    catalystType: "contract",
    category: "contract",
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    eventDateLabel: "Mon",
    priceAtIngest: 1,
    changePercentAtIngest: 1,
    priceCheckpoints: [],
    evidence: ["Category: contract", "According to sources exclusive"],
    riskFlags: [],
    guided: {
      whatHappened: "full text",
      whyItMattered: "x",
      trapRisks: "y",
      howItReacted: "z",
    },
    textRedacted: false,
    redistributionPermitted: true,
  };
  const out = redactCuratedIfNeeded(base);
  assert.equal(out.textRedacted, true);
  assert.equal(out.evidence.some((e) => /exclusive/i.test(e)), false);
});

test("assertNoPrivateFields throws on webhook-like keys", () => {
  assert.throws(() =>
    assertNoPrivateFields({ discordWebhook: "https://discord.com/api/webhooks/x" })
  );
  assert.throws(() => assertNoPrivateFields({ userId: "abc" }));
  assert.throws(() => assertNoPrivateFields({ phoneNumber: "+15551212" }));
});

test("analytics allowlist rejects unknown events", () => {
  assert.equal(isDemoAnalyticsEvent("demo_opened"), true);
  assert.equal(isDemoAnalyticsEvent("catalyst_expanded"), true);
  assert.equal(isDemoAnalyticsEvent("source_clicked"), true);
  assert.equal(isDemoAnalyticsEvent("replay_completed"), true);
  assert.equal(isDemoAnalyticsEvent("trial_cta_clicked"), true);
  assert.equal(isDemoAnalyticsEvent("passwordHash"), false);
  assert.equal(isDemoAnalyticsEvent("user_email"), false);
});
