/**
 * Alert Backbone V2 load / resilience scenarios (local).
 * Results are NOT production SLOs — see docs/ALERT_BACKBONE_V2_LOAD_REPORT.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueAlertJob,
  dequeueAlertJob,
  ackAlertJob,
  getQueueDepths,
  recoverProcessingJobs,
  claimChannelDelivery,
  dispatchChannelsIsolated,
  acquireDistributedLock,
  releaseDistributedLock,
  upsertAlertEventVersion,
  buildAlertEventId,
} from "../src/lib/alert-backbone/index.ts";
import { __resetQueuesForTests } from "../src/lib/alert-backbone/queues.ts";
import { __resetAlertEventsForTests } from "../src/lib/alert-backbone/events.ts";
import { __resetAlertLocksForTests } from "../src/lib/alert-backbone/locks.ts";
import { __resetDeliveryLogForTests } from "../src/lib/alert-backbone/delivery-log.ts";

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail: Record<string, number | string | boolean>;
  assumptions: string[];
};

const results: ScenarioResult[] = [];

function record(r: ScenarioResult) {
  results.push(r);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ loadScenario: r }));
}

test("load: burst of 5,000 events enqueue + drain sample", async () => {
  __resetQueuesForTests();
  const BURST = 5_000;
  const t0 = Date.now();
  const promises = [];
  for (let i = 0; i < BURST; i++) {
    promises.push(
      enqueueAlertJob({
        eventId: `burst_${i}`,
        version: 1,
        phase: "preliminary",
        queue: i % 2 === 0 ? "licensed_news" : "editorial_news",
        catalystId: `c_${i}`,
        rawNewsId: `r_${i}`,
        symbol: "TEST",
        headline: `Burst ${i}`,
        source: "load_test",
        sourceTier: null,
        publishedAt: new Date().toISOString(),
        timestampQuality: "MISSING",
        providerTimestampUnreliable: true,
        createdAt: new Date().toISOString(),
      })
    );
    if (promises.length >= 200) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  await Promise.all(promises);
  const enqueueMs = Date.now() - t0;

  let drained = 0;
  const t1 = Date.now();
  // Drain a sample (full 5k drain would be slow on REST Redis; memory path is fine)
  const SAMPLE = 500;
  for (let i = 0; i < SAMPLE; i++) {
    const job = await dequeueAlertJob("licensed_news");
    if (!job) break;
    await ackAlertJob("licensed_news", job.id);
    drained++;
  }
  const drainMs = Date.now() - t1;
  const depths = await getQueueDepths();

  record({
    name: "burst_5000_events",
    ok: enqueueMs < 60_000 && drained > 0,
    detail: {
      burst: BURST,
      enqueueMs,
      sampleDrained: drained,
      drainSampleMs: drainMs,
      licensedReady: depths.licensed_news.ready,
      editorialReady: depths.editorial_news.ready,
    },
    assumptions: [
      "In-memory queue when Redis unset; Upstash REST would be slower",
      "Full drain of 5k not required for pass — sample 500",
    ],
  });
  assert.ok(enqueueMs < 60_000);
});

test("load: 1,000 simultaneous browser delivery claims", async () => {
  __resetAlertEventsForTests();
  __resetDeliveryLogForTests();
  const N = 1_000;
  const t0 = Date.now();
  const claims = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      claimChannelDelivery({
        eventId: `browser_conn_${i}`,
        version: 1,
        userId: `user_${i}`,
        channel: "browser",
        omitVersion: true,
      })
    )
  );
  const ms = Date.now() - t0;
  const unique = claims.filter(Boolean).length;
  record({
    name: "1000_browser_connections_claims",
    ok: unique === N && ms < 30_000,
    detail: { n: N, uniqueClaims: unique, ms },
    assumptions: [
      "Simulates idempotent claim fan-out, not real EventSource sockets",
      "Browser SSE fan-out is process-limited by Next.js runtime",
    ],
  });
  assert.equal(unique, N);
});

test("load: provider disconnect recovery via processing reclaim", async () => {
  __resetQueuesForTests();
  for (let i = 0; i < 50; i++) {
    await enqueueAlertJob({
      eventId: `disc_${i}`,
      version: 1,
      phase: "preliminary",
      queue: "primary_filings",
      catalystId: `c${i}`,
      rawNewsId: `r${i}`,
      symbol: "SECX",
      headline: "filing",
      source: "SEC EDGAR",
      sourceTier: "tier0",
      publishedAt: new Date().toISOString(),
      timestampQuality: "EXACT_PROVIDER",
      providerTimestampUnreliable: false,
      createdAt: new Date().toISOString(),
    });
  }
  // Simulate crash mid-processing
  for (let i = 0; i < 20; i++) {
    await dequeueAlertJob("primary_filings");
  }
  const recovered = await recoverProcessingJobs("primary_filings", 0);
  record({
    name: "provider_disconnect_recovery",
    ok: recovered >= 20,
    detail: { recovered },
    assumptions: ["Processing list is the durable in-flight set; Redis restart covered separately"],
  });
  assert.ok(recovered >= 20);
});

test("load: Redis restart simulation (memory fallback + re-lock)", async () => {
  __resetAlertLocksForTests();
  const a = await acquireDistributedLock("redis_restart", 5_000);
  assert.equal(a.acquired, true);
  // Simulate lost lock state
  __resetAlertLocksForTests();
  const b = await acquireDistributedLock("redis_restart", 5_000);
  record({
    name: "redis_restart_simulation",
    ok: b.acquired === true,
    detail: { relocked: b.acquired },
    assumptions: [
      "Without Redis, locks are process-local; true Redis restart clears NX keys and allows reacquire",
      "Does not connect to live Upstash in CI",
    ],
  });
  assert.equal(b.acquired, true);
  await releaseDistributedLock("redis_restart", b.token!);
});

test("load: database slowdown does not block channel isolation", async () => {
  __resetDeliveryLogForTests();
  __resetAlertEventsForTests();
  const slowDb = () => new Promise((r) => setTimeout(r, 120));
  const t0 = Date.now();
  const results = await dispatchChannelsIsolated([
    {
      channel: "in_app",
      userId: "u",
      eventId: "dbslow",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "immediate",
      send: async () => true,
    },
    {
      channel: "email",
      userId: "u",
      eventId: "dbslow",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => {
        await slowDb();
        return true;
      },
    },
    {
      channel: "discord",
      userId: "u",
      eventId: "dbslow",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => true,
    },
  ]);
  const ms = Date.now() - t0;
  const discord = results.find((r) => r.channel === "discord");
  record({
    name: "database_slowdown_isolation",
    ok: discord?.status === "delivered" && ms < 500,
    detail: { ms, discord: discord?.status ?? "missing" },
    assumptions: ["Slow path is simulated delay, not real Postgres"],
  });
  assert.equal(discord?.status, "delivered");
});

test("load: duplicate provider delivery claimed once", async () => {
  __resetAlertEventsForTests();
  const eventId = buildAlertEventId({
    providerItemId: "dup-1",
    title: "Same Story!!!",
    ticker: "DUP",
    publishedAt: new Date("2026-07-27T15:00:00Z"),
  });
  const a = await upsertAlertEventVersion({
    eventId,
    queue: "licensed_news",
    catalystId: "c1",
    rawNewsId: "dup-1",
    symbol: "DUP",
    headline: "Same Story",
    source: "A",
    sourceTier: null,
    publishedAt: new Date().toISOString(),
    timestampQuality: "EXACT_PROVIDER",
    providerTimestampUnreliable: false,
    phase: "preliminary",
  });
  const b = await upsertAlertEventVersion({
    eventId,
    queue: "licensed_news",
    catalystId: "c1",
    rawNewsId: "dup-1",
    symbol: "DUP",
    headline: "Same Story",
    source: "B",
    sourceTier: null,
    publishedAt: new Date().toISOString(),
    timestampQuality: "EXACT_PROVIDER",
    providerTimestampUnreliable: false,
    phase: "preliminary",
  });
  const c1 = await claimChannelDelivery({
    eventId,
    version: a.version,
    userId: "u",
    channel: "sms",
    omitVersion: true,
  });
  const c2 = await claimChannelDelivery({
    eventId,
    version: b.version,
    userId: "u",
    channel: "sms",
    omitVersion: true,
  });
  record({
    name: "duplicate_provider_delivery",
    ok: a.version === b.version && c1 && !c2,
    detail: { versionA: a.version, versionB: b.version, firstClaim: c1, secondClaim: c2 },
    assumptions: ["Idempotency key collapses provider duplicates in same publish window"],
  });
  assert.equal(a.version, b.version);
  assert.equal(c1, true);
  assert.equal(c2, false);
});

test("load: slow SMS and email vendors run in parallel", async () => {
  __resetDeliveryLogForTests();
  __resetAlertEventsForTests();
  const t0 = Date.now();
  await dispatchChannelsIsolated([
    {
      channel: "in_app",
      userId: "u",
      eventId: "slowvendors",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "immediate",
      send: async () => true,
    },
    {
      channel: "sms",
      userId: "u",
      eventId: "slowvendors",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return true;
      },
    },
    {
      channel: "email",
      userId: "u",
      eventId: "slowvendors",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return true;
      },
    },
  ]);
  const ms = Date.now() - t0;
  record({
    name: "slow_sms_email_parallel",
    ok: ms < 180,
    detail: { ms },
    assumptions: [
      "If sequential, would be ≥200ms; parallel target <180ms wall clock",
    ],
  });
  assert.ok(ms < 180, `expected parallel vendors <180ms, got ${ms}`);
});

test("load: write summary for report", () => {
  assert.ok(results.length >= 6);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      alertBackboneLoadSummary: results,
      disclaimer:
        "Local/simulated measurements only. Do not claim production SLOs from these numbers.",
    })
  );
});
