import assert from "node:assert/strict";
import test from "node:test";

/**
 * Integration: persists a LatencyTrace row and reads cohort-separated metrics.
 * Skips when DATABASE_URL is unset (CI/local without Postgres).
 */
test("latency trace persist + public proof segregation", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const { prisma } = await import("../src/lib/prisma.ts");
  const { recordLatencyTrace } = await import("../src/lib/latency-trace/persist.ts");
  const {
    markTracesSsePublished,
    markTracesFirstDelivery,
  } = await import("../src/lib/latency-trace/persist.ts");
  const { getPublicLatencyProof } = await import("../src/lib/latency-trace/metrics.ts");
  const { cleanupLatencyTraces } = await import("../src/lib/latency-trace/retention.ts");

  const suffix = `lt-${Date.now()}`;
  const catalyst = await prisma.catalyst.create({
    data: {
      symbol: "AAPL",
      headline: `TEST ${suffix} beats estimates`,
      source: "Benzinga",
      publishedAt: new Date(Date.now() - 8_000),
      catalystType: "earnings",
      rawNewsId: `test-${suffix}`,
      sourceTier: "aggregator",
    },
  });

  const providerPublishedAt = new Date(Date.now() - 8_000);
  const firstFetchedAt = new Date(Date.now() - 6_000);
  const fetchCompletedAt = new Date(Date.now() - 5_000);
  const classifiedAt = new Date(Date.now() - 3_000);
  const persistedAt = new Date(Date.now() - 2_000);

  await recordLatencyTrace({
    catalystId: catalyst.id,
    source: "Benzinga",
    sourceTier: "aggregator",
    providerItemId: `test-${suffix}`,
    url: "https://example.com/test-latency",
    symbol: "AAPL",
    catalystType: "earnings",
    headline: `TEST ${suffix} beats estimates`,
    relatedSymbols: [],
    timestampQuality: "EXACT_PROVIDER",
    providerPublishedAt,
    firstFetchedAt,
    fetchCompletedAt,
    parsedAt: fetchCompletedAt,
    classifiedAt,
    persistedAt,
  });

  await markTracesSsePublished([catalyst.id], new Date(Date.now() - 1_000));
  await markTracesFirstDelivery([catalyst.id], new Date());

  const row = await prisma.latencyTrace.findUnique({
    where: { catalystId: catalyst.id },
  });
  assert.ok(row);
  assert.equal(row!.metricCohort, "actionable_breaking");
  assert.equal(row!.actionable, true);
  assert.ok(row!.fetchLatencyMs != null);
  assert.ok(row!.processingLatencyMs != null);
  assert.ok(row!.deliveryLatencyMs != null);
  assert.ok(row!.totalLatencyMs != null);
  assert.ok(row!.urlHash);
  assert.ok(row!.ssePublishedAt);
  assert.ok(row!.firstDeliveryAttemptAt);

  const proof = await getPublicLatencyProof({ hours: 24, minSamples: 1 });
  assert.ok(proof.cohorts.some((c) => c.cohort === "actionable_breaking"));
  assert.ok(proof.cohorts.some((c) => c.cohort === "urgent_filing"));
  assert.ok(proof.cohorts.some((c) => c.cohort === "scheduled_earnings"));
  assert.ok(proof.cohorts.some((c) => c.cohort === "editorial_recap"));
  assert.equal("overall" in proof, false);

  await prisma.latencyTrace.deleteMany({ where: { catalystId: catalyst.id } });
  await prisma.catalyst.delete({ where: { id: catalyst.id } });

  const cleaned = await cleanupLatencyTraces(3650);
  assert.ok(cleaned.deleted >= 0);
});
