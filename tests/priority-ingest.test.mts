import assert from "node:assert/strict";
import test from "node:test";
import {
  acquirePartitionLock,
  releasePartitionLock,
  __resetMemoryLocksForTests,
} from "../src/lib/ingest/lock.ts";
import {
  buildIdempotencyKey,
  normalizeTitle,
  canonicalUrl,
} from "../src/lib/ingest/idempotency.ts";
import {
  claimIdempotency,
  __resetIdempotencyForTests,
} from "../src/lib/ingest/idempotency-store.ts";
import {
  getCircuitState,
  recordCircuitFailure,
  recordCircuitSuccess,
  __resetCircuitsForTests,
} from "../src/lib/ingest/circuit.ts";
import { backoffWithJitterMs, getMarketPhase } from "../src/lib/ingest/schedule.ts";
import { parseProviderTimestamp } from "../src/lib/latency-trace/timestamps.ts";
import {
  beginIngestDrain,
  clearIngestDrain,
  isIngestDraining,
  __resetDrainForTests,
} from "../src/lib/ingest/drain.ts";
import {
  pushDeadLetter,
  listDeadLetters,
  removeDeadLetter,
  __resetDlqForTests,
} from "../src/lib/ingest/dlq.ts";
import { isSourceFlagEnabled } from "../src/lib/ingest/flags.ts";
import type { SourceDefinition } from "../src/lib/ingest/types.ts";
import type { NewsArticle } from "../src/types/index.ts";

test("duplicate workers: only one acquires the same partition lock", async () => {
  __resetMemoryLocksForTests();
  const a = await acquirePartitionLock("test:part", 5_000);
  const b = await acquirePartitionLock("test:part", 5_000);
  assert.equal(a.acquired, true);
  assert.equal(b.acquired, false);
  await releasePartitionLock("test:part", a.token!);
  const c = await acquirePartitionLock("test:part", 5_000);
  assert.equal(c.acquired, true);
  await releasePartitionLock("test:part", c.token!);
});

test("idempotency key is stable across duplicate payloads", () => {
  const a = buildIdempotencyKey({
    providerItemId: "rss-1",
    url: "https://example.com/a?utm_source=x",
    title: "AAPL Announces Buyback!!!",
    ticker: "aapl",
    publishedAt: new Date("2026-07-27T14:00:00.000Z"),
  });
  const b = buildIdempotencyKey({
    providerItemId: "rss-1",
    url: "https://example.com/a",
    title: "aapl announces buyback",
    ticker: "AAPL",
    publishedAt: new Date("2026-07-27T14:03:00.000Z"),
  });
  assert.equal(a, b);
  assert.equal(normalizeTitle("Hello!!!"), "hello");
  assert.ok(canonicalUrl("https://Ex.com/x?utm_source=1").includes("ex.com"));
});

test("idempotency store rejects duplicate claim", async () => {
  __resetIdempotencyForTests();
  const article: NewsArticle = {
    id: "x1",
    symbol: "TSLA",
    headline: "TSLA beats estimates",
    source: "Benzinga",
    url: "https://example.com/tsla",
    publishedAt: new Date("2026-07-27T15:00:00.000Z"),
  };
  const first = await claimIdempotency(article);
  const second = await claimIdempotency(article);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test("circuit opens after repeated failures and cools down", async () => {
  __resetCircuitsForTests();
  const cfg = { failureThreshold: 3, coolDownMs: 50 };
  for (let i = 0; i < 3; i++) {
    await recordCircuitFailure("test_provider", cfg);
  }
  const open = await getCircuitState("test_provider", cfg);
  assert.equal(open.state, "open");
  assert.equal(open.allow, false);
  await new Promise((r) => setTimeout(r, 60));
  const half = await getCircuitState("test_provider", cfg);
  assert.equal(half.allow, true);
  await recordCircuitSuccess("test_provider");
  const closed = await getCircuitState("test_provider", cfg);
  assert.equal(closed.state, "closed");
});

test("source failure lands in DLQ and can be removed (admin retry path)", async () => {
  __resetDlqForTests();
  const item = await pushDeadLetter({
    sourceId: "rss_fast",
    tier: 2,
    error: "upstream 503",
    attempt: 2,
    payloadSummary: "test",
  });
  const listed = await listDeadLetters(10);
  assert.ok(listed.some((d) => d.id === item.id));
  assert.equal(await removeDeadLetter(item.id), true);
  const after = await listDeadLetters(10);
  assert.equal(after.some((d) => d.id === item.id), false);
});

test("feature flags can disable a source independently", () => {
  const def: SourceDefinition = {
    id: "unit_test_src",
    name: "Unit",
    tier: 3,
    provider: "unit",
    partition: "tier3:unit",
    featureFlag: "INGEST_SOURCE_UNIT_TEST_SRC_ENABLED",
    intervals: {
      premarket: 1000,
      regular: 1000,
      afterhours: 1000,
      overnight: 1000,
    },
    rateLimit: { max: 1, windowMs: 1000 },
    circuit: { failureThreshold: 3, coolDownMs: 1000 },
  };
  const prev = process.env.INGEST_SOURCE_UNIT_TEST_SRC_ENABLED;
  process.env.INGEST_SOURCE_UNIT_TEST_SRC_ENABLED = "false";
  assert.equal(isSourceFlagEnabled(def), false);
  process.env.INGEST_SOURCE_UNIT_TEST_SRC_ENABLED = "true";
  assert.equal(isSourceFlagEnabled(def), true);
  if (prev == null) delete process.env.INGEST_SOURCE_UNIT_TEST_SRC_ENABLED;
  else process.env.INGEST_SOURCE_UNIT_TEST_SRC_ENABLED = prev;
});

test("backoff with jitter stays within bounds", () => {
  for (let i = 0; i < 20; i++) {
    const ms = backoffWithJitterMs(3, { baseMs: 1000, maxMs: 8000 });
    assert.ok(ms >= 0 && ms <= 8000);
  }
});

test("malformed timestamps are INVALID / MISSING", () => {
  assert.equal(parseProviderTimestamp("not-a-date").quality, "INVALID");
  assert.equal(parseProviderTimestamp(null).quality, "MISSING");
  assert.equal(parseProviderTimestamp("").quality, "MISSING");
});

test("stale publish window helper rejects ancient dates via parse", () => {
  const ancient = parseProviderTimestamp("1990-01-01T00:00:00.000Z", {
    fieldKind: "published",
  });
  assert.equal(ancient.quality, "INVALID");
});

test("drain flag blocks new work after graceful shutdown signal", async () => {
  __resetDrainForTests();
  assert.equal(await isIngestDraining(), false);
  await beginIngestDrain();
  assert.equal(await isIngestDraining(), true);
  await clearIngestDrain();
  assert.equal(await isIngestDraining(), false);
});

test("getMarketPhase returns a known phase", () => {
  const phase = getMarketPhase(new Date("2026-07-27T14:00:00.000Z"));
  assert.ok(["premarket", "regular", "afterhours", "overnight"].includes(phase));
});
