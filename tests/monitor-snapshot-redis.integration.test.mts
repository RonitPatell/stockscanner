/**
 * Redis integration tests for Monitor public snapshot pointer swap.
 * Skips when UPSTASH_REDIS_REST_URL / TOKEN are not configured.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isRedisConfigured, getRedis } from "../src/lib/redis.ts";
import {
  buildMonitorPublicSnapshot,
  type NormalizedSnapshotTickerInput,
} from "../src/domain/monitor/snapshot/index.ts";
import {
  MonitorSnapshotRedisStore,
  SNAPSHOT_ACTIVE_PTR_KEY,
  type SnapshotRedisLike,
} from "../src/lib/monitor/snapshot/redis-store.ts";

function ticker(symbol: string, attention: number): NormalizedSnapshotTickerInput {
  return {
    symbol,
    attentionPriority: attention,
    momentumIntensity: 0.5,
    momentumState: "BUILDING",
    direction: "up",
    reactionStage: "initial",
    tradeability: "LIQUID",
    primaryRisk: "none",
    dataConfidence: "HIGH",
    haltState: "none",
    quoteTimestampMs: Date.now(),
  };
}

test("Upstash Redis atomic snapshot publish + rollback", async (t) => {
  if (!isRedisConfigured()) {
    t.skip("UPSTASH_REDIS_REST_URL/TOKEN not set");
    return;
  }

  const redis = getRedis();
  assert.ok(redis);
  const adapter: SnapshotRedisLike = {
    get: (key) => redis.get<string>(key),
    set: async (key, value, opts) => {
      if (opts?.nx) {
        return opts.ex != null
          ? redis.set(key, value, { nx: true, ex: opts.ex })
          : redis.set(key, value, { nx: true });
      }
      if (opts?.ex != null) return redis.set(key, value, { ex: opts.ex });
      return redis.set(key, value);
    },
    del: (...keys) => redis.del(...keys),
  };

  const suffix = `itest_${Date.now()}`;
  const eventBase = Date.now() * 1000;
  const store = new MonitorSnapshotRedisStore(adapter, {
    ttlSec: 120,
    lockTtlSec: 10,
  });

  const a = buildMonitorPublicSnapshot({
    nowMs: Date.now(),
    lastEventId: String(eventBase + 1),
    marketSession: "regular",
    tickers: [ticker("ITST", 88)],
    marketStateAgeMs: 100,
    // Isolation from any production active snapshot during local integration runs.
    recovery: true,
  });
  a.snapshotId = `${suffix}_snap_a`;

  const b = buildMonitorPublicSnapshot({
    nowMs: Date.now() + 1,
    lastEventId: String(eventBase + 2),
    marketSession: "regular",
    tickers: [ticker("ITST", 91), ticker("IT2", 40)],
    marketStateAgeMs: 120,
    recovery: true,
  });
  b.snapshotId = `${suffix}_snap_b`;

  try {
    const r1 = await store.publish(a);
    assert.equal(r1.ok, true, JSON.stringify(r1));
    const byId = await store.getById(a.snapshotId);
    assert.equal(byId?.snapshotId, a.snapshotId);

    const r2 = await store.publish(b);
    assert.equal(r2.ok, true, JSON.stringify(r2));
    const byB = await store.getById(b.snapshotId);
    assert.equal(byB?.priorityLadder.length, 2);

    // If we currently own the active pointer, rollback should restore previous.
    const ptr = await redis.get<string>(SNAPSHOT_ACTIVE_PTR_KEY);
    if (ptr === b.snapshotId) {
      const rolled = await store.rollbackToPrevious();
      assert.ok(rolled);
      assert.equal(rolled.snapshotId, a.snapshotId);
    }
  } finally {
    // Best-effort cleanup of test bodies (do not clear shared active if not ours).
    await redis.del(
      `tt:monitor:public-snapshot:v1:body:${a.snapshotId}`,
      `tt:monitor:public-snapshot:v1:body:${b.snapshotId}`,
      `tt:monitor:public-snapshot:v1:staging:${a.snapshotId}`,
      `tt:monitor:public-snapshot:v1:staging:${b.snapshotId}`
    );
  }
});
