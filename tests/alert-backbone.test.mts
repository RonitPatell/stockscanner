import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAlertEventId,
  claimChannelDelivery,
  dispatchChannelsIsolated,
  enqueueAlertJob,
  dequeueAlertJob,
  failAlertJob,
  ackAlertJob,
  recoverProcessingJobs,
  getQueueDepths,
  isAlertStale,
  isProviderTimestampUnreliable,
  mapSourceToQueue,
  recordDeliveryLifecycle,
  listRecentDeliveries,
  acquireDistributedLock,
  releaseDistributedLock,
  upsertAlertEventVersion,
  getEventVersion,
  getServiceTargets,
  compareTarget,
} from "../src/lib/alert-backbone/index.ts";
import { __resetAlertEventsForTests } from "../src/lib/alert-backbone/events.ts";
import { __resetQueuesForTests } from "../src/lib/alert-backbone/queues.ts";
import { __resetAlertLocksForTests } from "../src/lib/alert-backbone/locks.ts";
import { __resetDeliveryLogForTests } from "../src/lib/alert-backbone/delivery-log.ts";
import { __resetHeartbeatsForTests } from "../src/lib/alert-backbone/heartbeats.ts";
import {
  detectAndBackfillGap,
  __resetCursorsForTests,
} from "../src/lib/alert-backbone/gap-backfill.ts";

function resetEvents() {
  __resetAlertEventsForTests();
}
function resetQueues() {
  __resetQueuesForTests();
}
function resetLocks() {
  __resetAlertLocksForTests();
}
function resetDelivery() {
  __resetDeliveryLogForTests();
}

test("service targets are config, never auto-achieved without samples", () => {
  const t = getServiceTargets();
  assert.ok(t.providerToIngestionP50Ms > 0);
  const c = compareTarget({
    metric: "x",
    target: 100,
    measured: 50,
    sampleSize: 10,
    direction: "lower_is_better",
  });
  assert.equal(c.achieved, false);
});

test("event versions: enrichment bumps without replacing preliminary id", async () => {
  resetEvents();
  const eventId = buildAlertEventId({
    providerItemId: "art-1",
    title: "ACME files 8-K",
    ticker: "ACME",
    publishedAt: new Date("2026-07-27T14:00:00Z"),
  });
  const v1 = await upsertAlertEventVersion({
    eventId,
    queue: "primary_filings",
    catalystId: "c1",
    rawNewsId: "art-1",
    symbol: "ACME",
    headline: "ACME files 8-K",
    source: "SEC EDGAR",
    sourceTier: "tier0",
    publishedAt: new Date().toISOString(),
    timestampQuality: "EXACT_PROVIDER",
    providerTimestampUnreliable: false,
    phase: "preliminary",
  });
  assert.equal(v1.version, 1);
  const v2 = await upsertAlertEventVersion({
    eventId,
    queue: "enrichment",
    catalystId: "c1",
    rawNewsId: "art-1",
    symbol: "ACME",
    headline: "ACME files 8-K",
    source: "SEC EDGAR",
    sourceTier: "tier0",
    publishedAt: v1.publishedAt,
    timestampQuality: "EXACT_PROVIDER",
    providerTimestampUnreliable: false,
    phase: "enriched",
  });
  assert.ok(v2.version >= 2);
  assert.equal(await getEventVersion(eventId), v2.version);
});

test("idempotency: channel claim prevents duplicate alerts across versions", async () => {
  resetEvents();
  const a = await claimChannelDelivery({
    eventId: "evt_x",
    version: 1,
    userId: "u1",
    channel: "discord",
    omitVersion: true,
  });
  const b = await claimChannelDelivery({
    eventId: "evt_x",
    version: 2,
    userId: "u1",
    channel: "discord",
    omitVersion: true,
  });
  assert.equal(a, true);
  assert.equal(b, false);
});

test("queues persist jobs and support retry + DLQ", async () => {
  resetQueues();
  const job = await enqueueAlertJob({
    eventId: "e1",
    version: 1,
    phase: "preliminary",
    queue: "licensed_news",
    catalystId: "c",
    rawNewsId: "r",
    symbol: "XYZ",
    headline: "h",
    source: "Benzinga",
    sourceTier: "tier1",
    publishedAt: new Date().toISOString(),
    timestampQuality: "EXACT_PROVIDER",
    providerTimestampUnreliable: false,
    createdAt: new Date().toISOString(),
    attempt: 1,
  });
  const depths = await getQueueDepths();
  assert.ok(depths.licensed_news.ready >= 1);

  const dequeued = await dequeueAlertJob("licensed_news");
  assert.ok(dequeued);
  assert.equal(dequeued!.id, job.id);

  const retried = await failAlertJob(dequeued!, "boom", { maxAttempts: 5 });
  assert.equal(retried, "retried");

  // Force DLQ by failing a job already at maxAttempts
  const nearDead = await enqueueAlertJob({
    ...dequeued!.envelope,
    attempt: 5,
  });
  const deadJob = await dequeueAlertJob("licensed_news");
  assert.ok(deadJob);
  // Prefer the high-attempt job
  const target =
    deadJob!.attempt >= 5
      ? deadJob!
      : { ...deadJob!, attempt: 5, envelope: { ...deadJob!.envelope, attempt: 5 } };
  const state = await failAlertJob(target, "boom", { maxAttempts: 5 });
  assert.equal(state, "dlq");
  void nearDead;
});

test("recover processing jobs after simulated worker restart", async () => {
  resetQueues();
  await enqueueAlertJob({
    eventId: "e2",
    version: 1,
    phase: "preliminary",
    queue: "editorial_news",
    catalystId: "c",
    rawNewsId: "r",
    symbol: "ABC",
    headline: "h",
    source: "RSS",
    sourceTier: null,
    publishedAt: new Date().toISOString(),
    timestampQuality: "MISSING",
    providerTimestampUnreliable: true,
    createdAt: new Date().toISOString(),
  });
  const job = await dequeueAlertJob("editorial_news");
  assert.ok(job);
  // Make it look old
  job!.enqueuedAt = new Date(Date.now() - 120_000).toISOString();
  // Put back into processing via fail path recovery simulation
  await ackAlertJob("editorial_news", job!.id);
  // Manually: enqueue then dequeue without ack, then recover
  await enqueueAlertJob(job!.envelope);
  await dequeueAlertJob("editorial_news");
  const recovered = await recoverProcessingJobs("editorial_news", 0);
  assert.ok(recovered >= 1);
});

test("stale suppression by category", () => {
  const old = new Date(Date.now() - 5 * 60 * 60_000).toISOString();
  assert.equal(isAlertStale({ publishedAt: old, queue: "market_events" }), true);
  assert.equal(
    isAlertStale({ publishedAt: new Date().toISOString(), queue: "licensed_news" }),
    false
  );
});

test("unreliable provider timestamps detected", () => {
  assert.equal(isProviderTimestampUnreliable("MISSING"), true);
  assert.equal(isProviderTimestampUnreliable("INVALID"), true);
  assert.equal(isProviderTimestampUnreliable("EXACT_PROVIDER"), false);
  assert.equal(mapSourceToQueue({ source: "SEC EDGAR", isSec: true }), "primary_filings");
});

test("channel isolation: slow SMS does not delay Discord", async () => {
  resetDelivery();
  resetEvents();
  const order: string[] = [];
  const results = await dispatchChannelsIsolated([
    {
      channel: "in_app",
      userId: "u",
      eventId: "evt_iso",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "immediate",
      send: async () => {
        order.push("in_app");
        return true;
      },
    },
    {
      channel: "sms",
      userId: "u",
      eventId: "evt_iso",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => {
        await new Promise((r) => setTimeout(r, 80));
        order.push("sms");
        return true;
      },
    },
    {
      channel: "discord",
      userId: "u",
      eventId: "evt_iso",
      eventVersion: 1,
      catalystId: "c",
      queue: "licensed_news",
      publishedAt: new Date().toISOString(),
      priority: "async",
      send: async () => {
        order.push("discord");
        return true;
      },
    },
  ]);
  assert.equal(order[0], "in_app");
  assert.ok(order.includes("discord"));
  assert.ok(order.indexOf("discord") < order.indexOf("sms"));
  assert.equal(results.filter((r) => r.status === "delivered").length, 3);
  const logs = await listRecentDeliveries(20);
  assert.ok(logs.some((l) => l.channel === "discord" && l.status === "delivered"));
});

test("distributed lock mutual exclusion", async () => {
  resetLocks();
  const a = await acquireDistributedLock("t1", 5_000);
  const b = await acquireDistributedLock("t1", 5_000);
  assert.equal(a.acquired, true);
  assert.equal(b.acquired, false);
  await releaseDistributedLock("t1", a.token!);
  const c = await acquireDistributedLock("t1", 5_000);
  assert.equal(c.acquired, true);
  await releaseDistributedLock("t1", c.token!);
});

test("gap detection increments on missed heartbeat window", async () => {
  __resetHeartbeatsForTests();
  __resetCursorsForTests();
  await detectAndBackfillGap({
    sourceId: "sec_wire",
    provider: "sec",
    newCursor: "c1",
    expectedIntervalMs: 10,
    connectionMode: "stream",
  });
  await new Promise((r) => setTimeout(r, 40));
  const gap = await detectAndBackfillGap({
    sourceId: "sec_wire",
    provider: "sec",
    newCursor: "c2",
    expectedIntervalMs: 10,
    connectionMode: "stream",
  });
  assert.equal(gap.gap, true);
});

test("delivery lifecycle timestamps recorded", async () => {
  resetDelivery();
  const eventId = `lifecycle_${Date.now()}`;
  const a = await recordDeliveryLifecycle({
    eventId,
    eventVersion: 1,
    userId: "u",
    catalystId: "c",
    channel: "email",
    status: "accepted",
  });
  assert.ok(a.acceptedAt);
  const q = await recordDeliveryLifecycle({
    eventId,
    eventVersion: 1,
    userId: "u",
    catalystId: "c",
    channel: "email",
    status: "queued",
  });
  assert.ok(q.acceptedAt);
  assert.ok(q.queuedAt);
  const d = await recordDeliveryLifecycle({
    eventId,
    eventVersion: 1,
    userId: "u",
    catalystId: "c",
    channel: "email",
    status: "delivered",
  });
  assert.ok(d.acceptedAt);
  assert.ok(d.queuedAt);
  assert.ok(d.deliveredAt);
  const logs = await listRecentDeliveries(50);
  assert.ok(logs.some((l) => l.eventId === eventId));
});
