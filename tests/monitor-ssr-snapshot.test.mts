import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  buildMonitorPublicSnapshot,
  type MonitorPublicSnapshot,
  type NormalizedSnapshotTickerInput,
} from "../src/domain/monitor/snapshot/index.ts";
import { loadMonitorInitialSnapshotWithDeps } from "../src/lib/monitor/ssr/load-snapshot.ts";
import { personalizeMonitorSnapshot } from "../src/lib/monitor/ssr/personalize.ts";
import { DEFAULT_MONITOR_UI_PREFS } from "../src/lib/monitor/ssr/types.ts";
import type { MonitorInitialSnapshot } from "../src/lib/monitor/ssr/types.ts";
import { MonitorSsrCore } from "../src/components/monitor/MonitorSsrCore.ts";
import { snapshotTickersToLadderRows } from "../src/lib/monitor/ssr/to-ladder-rows.ts";

function sanitizePrefs(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MONITOR_UI_PREFS };
  return { ...DEFAULT_MONITOR_UI_PREFS, ...(raw as object) } as typeof DEFAULT_MONITOR_UI_PREFS;
}

function ticker(
  symbol: string,
  attention: number
): NormalizedSnapshotTickerInput {
  return {
    symbol,
    attentionPriority: attention,
    momentumIntensity: attention / 100,
    momentumState: "BUILDING",
    direction: "up",
    reactionStage: "developing",
    tradeability: "ACCEPTABLE",
    primaryRisk: "none",
    dataConfidence: "HIGH",
    haltState: "none",
    price: 3.25,
    sessionChangePct: 8,
    companyShortName: `${symbol} Co`,
    quoteTimestampMs: 1_700_000_099_500,
    lastQuoteAtMs: 1_700_000_099_500,
    provider: "hub",
  };
}

function sampleSnap(lastEventId = "9001"): MonitorPublicSnapshot {
  return buildMonitorPublicSnapshot({
    nowMs: 1_700_000_100_000,
    lastEventId,
    marketSession: "regular",
    tickers: [ticker("AAAA", 90), ticker("BBBB", 70), ticker("CCCC", 55)],
    marketStateAgeMs: 500,
  });
}

test("Redis fresh path returns REDIS_FRESH with generatedAt and lastEventId", async () => {
  const snap = sampleSnap("42");
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: snap.generatedAtMs + 1_000,
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async () => ({
      activePresetId: "preset_a",
      pinnedTicker: null,
      displayDensity: "comfortable",
      squawkEnabled: true,
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "REDIS_FRESH");
  assert.equal(result.lastEventId, "42");
  assert.ok(result.generatedAt);
  assert.ok(result.dataAgeMs != null);
  assert.equal(result.snapshot?.priorityLadder[0]?.symbol, "AAAA");
});

test("Redis timeout uses PostgreSQL fallback", async () => {
  const pg = sampleSnap("77");
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: Date.now(),
    redisTimeoutMs: 20,
    readRedis: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(sampleSnap("slow")), 200);
      }),
    readPostgres: async () => pg,
    readPrefs: async () => sanitizePrefs(null),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "POSTGRES_FALLBACK");
  assert.equal(result.lastEventId, "77");
});

test("stale-but-valid Redis is REDIS_STALE not unavailable", async () => {
  const snap = sampleSnap("11");
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: snap.generatedAtMs + 60_000,
    readRedis: async () => ({ ...snap, marketStateAgeMs: 60_000 }),
    readPostgres: async () => null,
    readPrefs: async () => sanitizePrefs(null),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "REDIS_STALE");
});

test("missing snapshot produces explicit UNAVAILABLE error state", async () => {
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    readRedis: async () => null,
    readPostgres: async () => null,
    readPrefs: async () => sanitizePrefs(null),
  });
  assert.equal(result.ok, false);
  assert.equal(result.source, "UNAVAILABLE");
  assert.equal(result.error?.code, "SNAPSHOT_UNAVAILABLE");
  assert.equal(result.snapshot, null);
});

test("bootstrapFromHub recovers cold Redis/PG miss", async () => {
  const snap = sampleSnap("boot");
  let bootCalls = 0;
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    readRedis: async () => null,
    readPostgres: async () => null,
    readPrefs: async () => sanitizePrefs(null),
    bootstrapFromHub: async () => {
      bootCalls += 1;
      return snap;
    },
  });
  assert.equal(bootCalls, 1);
  assert.equal(result.ok, true);
  assert.ok(result.snapshot);
});

test("User A cannot receive User B preferences", async () => {
  const snap = sampleSnap("5");
  const prefsByUser: Record<
    string,
    {
      activePresetId: string | null;
      pinnedTicker: string | null;
      displayDensity: "compact" | "comfortable" | "dense";
      squawkEnabled: boolean;
    }
  > = {
    user_a: {
      activePresetId: "preset_a",
      pinnedTicker: "AAAA",
      displayDensity: "compact",
      squawkEnabled: false,
    },
    user_b: {
      activePresetId: "preset_b",
      pinnedTicker: "BBBB",
      displayDensity: "dense",
      squawkEnabled: true,
    },
  };

  const forA = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async (id) => prefsByUser[id]!,
  });
  const forB = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_b",
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async (id) => prefsByUser[id]!,
  });

  assert.equal(forA.prefs.activePresetId, "preset_a");
  assert.equal(forA.prefs.pinnedTicker, "AAAA");
  assert.equal(forB.prefs.activePresetId, "preset_b");
  assert.equal(forB.prefs.pinnedTicker, "BBBB");
  assert.notEqual(forA.prefs.activePresetId, forB.prefs.activePresetId);
  assert.equal(forA.selectedSymbol, "AAAA");
  assert.equal(forB.selectedSymbol, "BBBB");
});

test("personalize reorders pin without changing globalLeader", () => {
  const snap = sampleSnap("1");
  const personalized = personalizeMonitorSnapshot(snap, {
    activePresetId: null,
    pinnedTicker: "CCCC",
    displayDensity: "comfortable",
    squawkEnabled: true,
  });
  assert.equal(personalized.globalLeader, "AAAA");
  assert.equal(personalized.priorityLadder[0]?.symbol, "CCCC");
});

test("Initial HTML contains ticker data from initialSnapshot", () => {
  const snap = sampleSnap("99");
  const initial: MonitorInitialSnapshot = {
    ok: true,
    source: "REDIS_FRESH",
    generatedAt: snap.generatedAt,
    generatedAtMs: snap.generatedAtMs,
    dataAgeMs: 400,
    lastEventId: snap.lastEventId,
    snapshot: snap,
    prefs: sanitizePrefs(null),
    selectedSymbol: "AAAA",
    selectedSummary: snap.priorityLadder[0] ?? null,
    error: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(MonitorSsrCore, { initialSnapshot: initial })
  );

  assert.match(html, /data-testid="monitor-ssr-core"/);
  assert.match(html, /data-testid="monitor-ssr-ticker-AAAA"/);
  assert.match(html, /data-symbol="AAAA"/);
  assert.match(html, /data-source="REDIS_FRESH"/);
  assert.match(html, /data-last-event-id="99"/);
  assert.match(html, /AAAA Co/);
  assert.doesNotMatch(html, /data-testid="monitor-snapshot-unavailable"/);
});

test("JavaScript-disabled HTML contains latest permitted snapshot tickers", () => {
  const snap = sampleSnap("101");
  const initial: MonitorInitialSnapshot = {
    ok: true,
    source: "POSTGRES_FALLBACK",
    generatedAt: snap.generatedAt,
    generatedAtMs: snap.generatedAtMs,
    dataAgeMs: 12_000,
    lastEventId: "101",
    snapshot: snap,
    prefs: {
      activePresetId: null,
      pinnedTicker: "BBBB",
      displayDensity: "comfortable",
      squawkEnabled: true,
    },
    selectedSymbol: "BBBB",
    selectedSummary:
      snap.priorityLadder.find((t) => t.symbol === "BBBB") ?? null,
    error: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(MonitorSsrCore, { initialSnapshot: initial })
  );

  assert.match(html, /monitor-ssr-ticker-AAAA/);
  assert.match(html, /monitor-ssr-ticker-BBBB/);
  assert.match(html, /data-source="POSTGRES_FALLBACK"/);
  assert.match(html, /data-testid="monitor-ssr-selected"/);
  assert.match(html, /BBBB/);
});

test("Missing snapshot HTML is explicit error state", () => {
  const initial: MonitorInitialSnapshot = {
    ok: false,
    source: "UNAVAILABLE",
    generatedAt: new Date().toISOString(),
    generatedAtMs: Date.now(),
    dataAgeMs: null,
    lastEventId: null,
    snapshot: null,
    prefs: sanitizePrefs(null),
    selectedSymbol: null,
    selectedSummary: null,
    error: {
      code: "SNAPSHOT_UNAVAILABLE",
      message: "Monitor market snapshot is unavailable right now.",
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(MonitorSsrCore, { initialSnapshot: initial })
  );
  assert.match(html, /data-testid="monitor-snapshot-unavailable"/);
  assert.match(html, /SNAPSHOT_UNAVAILABLE/);
  assert.doesNotMatch(html, /data-testid="monitor-ssr-core"/);
});

test("No empty ladder during hydration when SSR seed present", () => {
  const snap = sampleSnap("55");
  const rows = snapshotTickersToLadderRows(snap.priorityLadder);
  assert.ok(rows.length >= 3);
  // Simulated client merge: never replace populated SSR with empty live result.
  const liveEmpty: typeof rows = [];
  const merged = liveEmpty.length > 0 ? liveEmpty : rows;
  assert.equal(merged.length, rows.length);
  assert.equal(merged[0]?.symbol, "AAAA");
});
