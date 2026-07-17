import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyFeedHealth,
  FEED_STALE_MS,
} from "../src/lib/system-health.ts";

const NOW = Date.parse("2026-07-17T16:00:00.000Z");

test("reports a recently refreshed feed as live", () => {
  assert.deepEqual(
    classifyFeedHealth({
      feedUpdatedAt: new Date(NOW - 30_000).toISOString(),
      feedItemCount: 12,
      pipelineInFlight: false,
      nowMs: NOW,
    }),
    { status: "live", feedAgeSec: 30 }
  );
});

test("reports an old feed as stale instead of live", () => {
  assert.deepEqual(
    classifyFeedHealth({
      feedUpdatedAt: new Date(NOW - FEED_STALE_MS - 1_000).toISOString(),
      feedItemCount: 12,
      pipelineInFlight: false,
      nowMs: NOW,
    }),
    { status: "stale", feedAgeSec: FEED_STALE_MS / 1000 + 1 }
  );
});

test("does not invent freshness when cached items have no timestamp", () => {
  assert.deepEqual(
    classifyFeedHealth({
      feedUpdatedAt: null,
      feedItemCount: 12,
      pipelineInFlight: false,
      nowMs: NOW,
    }),
    { status: "stale", feedAgeSec: null }
  );
});

test("reports active ingest while the pipeline is running", () => {
  assert.equal(
    classifyFeedHealth({
      feedUpdatedAt: new Date(NOW - FEED_STALE_MS - 1_000).toISOString(),
      feedItemCount: 12,
      pipelineInFlight: true,
      nowMs: NOW,
    }).status,
    "ingesting"
  );
});

