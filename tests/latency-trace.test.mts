import assert from "node:assert/strict";
import test from "node:test";
import { aggregateLatencyMs } from "../src/lib/latency-trace/aggregate.ts";
import { classifyMetricCohort } from "../src/lib/latency-trace/cohorts.ts";
import { computeLatencyTotals } from "../src/lib/latency-trace/totals.ts";
import {
  parseProviderTimestamp,
  marketSessionAt,
  urlHash,
} from "../src/lib/latency-trace/timestamps.ts";

test("parseProviderTimestamp marks published RFC822 as EXACT_PROVIDER", () => {
  const parsed = parseProviderTimestamp("Mon, 27 Jul 2026 14:00:00 GMT", {
    fieldKind: "published",
  });
  assert.equal(parsed.quality, "EXACT_PROVIDER");
  assert.ok(parsed.at);
  assert.equal(parsed.at!.toISOString(), "2026-07-27T14:00:00.000Z");
});

test("parseProviderTimestamp marks Atom updated as ARTICLE_UPDATED_TIME", () => {
  const parsed = parseProviderTimestamp("2026-07-27T14:05:00.000Z", {
    fieldKind: "updated",
  });
  assert.equal(parsed.quality, "ARTICLE_UPDATED_TIME");
  assert.ok(parsed.at);
});

test("parseProviderTimestamp returns MISSING / INVALID correctly", () => {
  assert.equal(parseProviderTimestamp(null).quality, "MISSING");
  assert.equal(parseProviderTimestamp("not-a-date").quality, "INVALID");
  assert.equal(parseProviderTimestamp("").quality, "MISSING");
});

test("aggregateLatencyMs marks unavailable below min samples", () => {
  const stats = aggregateLatencyMs([1000, 2000, 3000], 5);
  assert.equal(stats.available, false);
  assert.equal(stats.count, 3);
  assert.equal(stats.p50, null);
});

test("aggregateLatencyMs computes percentiles and under thresholds", () => {
  const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
  const stats = aggregateLatencyMs(values, 20);
  assert.equal(stats.available, true);
  assert.equal(stats.count, 20);
  assert.equal(stats.min, 1000);
  assert.equal(stats.max, 20000);
  assert.ok(stats.p50 != null);
  assert.ok(stats.p90 != null);
  assert.ok(stats.p99 != null);
  assert.equal(stats.pctUnder30s, 100);
  assert.ok((stats.pctUnder180s ?? 0) >= 100);
});

test("computeLatencyTotals derives stage latencies", () => {
  const t0 = new Date("2026-07-27T14:00:00.000Z");
  const t1 = new Date("2026-07-27T14:00:02.000Z");
  const t2 = new Date("2026-07-27T14:00:05.000Z");
  const t3 = new Date("2026-07-27T14:00:08.000Z");
  const totals = computeLatencyTotals({
    providerPublishedAt: t0,
    firstFetchedAt: t0,
    fetchCompletedAt: t1,
    persistedAt: t2,
    firstDeliveryAttemptAt: t3,
  });
  assert.equal(totals.fetchLatencyMs, 2000);
  assert.equal(totals.processingLatencyMs, 3000);
  assert.equal(totals.deliveryLatencyMs, 3000);
  assert.equal(totals.totalLatencyMs, 8000);
});

test("classifyMetricCohort keeps earnings/recaps/filings separated", () => {
  assert.equal(
    classifyMetricCohort({
      catalystType: "earnings",
      headline: "AAPL to report earnings tomorrow after the close",
    }).metricCohort,
    "scheduled_earnings"
  );
  assert.equal(
    classifyMetricCohort({
      catalystType: "earnings",
      headline: "AAPL beats Q2 estimates, raises guidance",
    }).metricCohort,
    "actionable_breaking"
  );
  assert.equal(
    classifyMetricCohort({
      catalystType: "macro",
      headline: "Stocks to watch: NVDA, TSLA, AMD",
      relatedSymbols: ["NVDA", "TSLA", "AMD"],
    }).metricCohort,
    "editorial_recap"
  );
  assert.equal(
    classifyMetricCohort({
      catalystType: "sec_filing",
      headline: "8-K Filing: Material event disclosure",
      source: "SEC EDGAR",
      providerItemId: "sec-8-k-0000320193-2026-07-27",
    }).metricCohort,
    "urgent_filing"
  );
});

test("urlHash is stable and truncated", () => {
  const a = urlHash("https://example.com/a");
  const b = urlHash("https://example.com/a");
  const c = urlHash("https://example.com/b");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a!.length, 32);
  assert.equal(urlHash(null), null);
});

test("marketSessionAt classifies weekday ET hours", () => {
  assert.equal(marketSessionAt(new Date("2026-07-27T14:00:00.000Z")), "regular");
  assert.equal(marketSessionAt(new Date("2026-07-27T12:00:00.000Z")), "premarket");
  assert.equal(marketSessionAt(new Date("2026-07-25T14:00:00.000Z")), "weekend");
});
