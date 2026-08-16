import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireWorkerLease,
  renewWorkerLease,
  releaseWorkerLease,
  __resetWorkerLeasesForTests,
} from "../src/lib/workers/lease.ts";
import {
  writeWorkerHeartbeat,
  readWorkerHeartbeat,
  isHeartbeatFresh,
  __resetWorkerHeartbeatsForTests,
} from "../src/lib/workers/heartbeat.ts";
import { toPublicMarketReadiness } from "../src/lib/workers/public-readiness.ts";
import { authorizeCron } from "../src/lib/cron-authorize.ts";

test("worker lease: only one owner; renew and release", async () => {
  __resetWorkerLeasesForTests();
  const a = await acquireWorkerLease("monitor_market", 5_000);
  assert.equal(a.acquired, true);
  assert.ok(a.handle?.token);

  const b = await acquireWorkerLease("monitor_market", 5_000);
  assert.equal(b.acquired, false);

  const renewed = await renewWorkerLease(a.handle!);
  assert.equal(renewed, true);

  await releaseWorkerLease(a.handle!);
  const c = await acquireWorkerLease("monitor_market", 5_000);
  assert.equal(c.acquired, true);
  await releaseWorkerLease(c.handle!);
});

test("heartbeat freshness window", async () => {
  __resetWorkerHeartbeatsForTests();
  const now = Date.now();
  await writeWorkerHeartbeat({
    name: "quote_stream",
    updatedAtMs: now,
    instanceId: "t1",
    meta: { providerConnected: true },
  });
  const hb = await readWorkerHeartbeat("quote_stream");
  assert.equal(isHeartbeatFresh(hb, 90_000, now + 1_000), true);
  assert.equal(isHeartbeatFresh(hb, 90_000, now + 120_000), false);
});

test("public readiness strips internal detail", () => {
  const pub = toPublicMarketReadiness({
    ready: true,
    status: "ready",
    session: "regular",
    checkedAtMs: 1,
    checks: {
      providerConnected: "ok",
      symbolUniverseLoaded: "ok",
      previousSessionBaselinesLoaded: "ok",
      activeSnapshotPublished: "ok",
      redisReachable: "ok",
      databaseReachable: "ok",
      eventStreamWritable: "ok",
      workerHeartbeat: "ok",
    },
    detail: {
      snapshotAgeMs: 12,
      quoteStreamAgeMs: 3,
      monitorWorkerAgeMs: 4,
      snapshotId: "snap_secret",
      dataQuality: "high",
    },
  });
  assert.equal(pub.ready, true);
  assert.equal("detail" in pub, false);
  assert.equal(
    JSON.stringify(pub).includes("snap_secret"),
    false
  );
});

test("cron auth fail-closed without secret outside local dev", () => {
  const prev = process.env.CRON_SECRET;
  const prevNode = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  const env = process.env as Record<string, string | undefined>;
  try {
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    env.VERCEL = "1";
    const req = new Request("https://example.com/api/cron/x", {
      headers: { authorization: "Bearer x" },
    });
    assert.equal(authorizeCron(req), false);
  } finally {
    if (prev == null) delete env.CRON_SECRET;
    else env.CRON_SECRET = prev;
    if (prevNode == null) delete env.NODE_ENV;
    else env.NODE_ENV = prevNode;
    if (prevVercel == null) delete env.VERCEL;
    else env.VERCEL = prevVercel;
  }
});
