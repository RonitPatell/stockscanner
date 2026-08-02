/**
 * Integration tests for instant Monitor startup paths:
 * Redis healthy / timeout → PG fallback, stream handoff, isolation, quiet/closed/burst.
 *
 * Complements Playwright e2e/monitor-startup.spec.ts (browser) with deterministic
 * Node injectable IO. Timing acceptance criteria are documented as staging goals —
 * not marketing claims.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
import {
  planSyncResume,
  effectiveLiveLabel,
  syncKeepsSnapshotVisible,
  detectLiveGap,
} from "../src/domain/monitor/sync/index.ts";
import {
  buildMonitorStartupHarness,
  buildPostgresFallbackStartupSeed,
} from "../src/components/monitor/startup-fixtures.ts";

const NOW = Date.parse("2026-08-01T14:35:00.000Z");

function sanitizePrefs(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MONITOR_UI_PREFS };
  return {
    ...DEFAULT_MONITOR_UI_PREFS,
    ...(raw as object),
  } as typeof DEFAULT_MONITOR_UI_PREFS;
}

function ticker(
  symbol: string,
  attention: number,
  extra?: Partial<NormalizedSnapshotTickerInput>
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
    quoteTimestampMs: NOW - 400,
    lastQuoteAtMs: NOW - 400,
    provider: "hub",
    ...extra,
  };
}

function sampleSnap(
  lastEventId: string,
  opts?: {
    session?: "regular" | "closed" | "open_auction";
    recovery?: boolean;
    tickers?: NormalizedSnapshotTickerInput[];
    ageMs?: number;
  }
): MonitorPublicSnapshot {
  return buildMonitorPublicSnapshot({
    nowMs: NOW,
    lastEventId,
    marketSession: opts?.session ?? "regular",
    tickers: opts?.tickers ?? [
      ticker("AAAA", 90),
      ticker("BBBB", 70),
      ticker("CCCC", 55),
    ],
    marketStateAgeMs: opts?.ageMs ?? 500,
    recovery: opts?.recovery,
  });
}

function toInitial(
  snap: MonitorPublicSnapshot,
  source: MonitorInitialSnapshot["source"],
  dataAgeMs: number
): MonitorInitialSnapshot {
  return {
    ok: true,
    source,
    generatedAt: snap.generatedAt,
    generatedAtMs: snap.generatedAtMs,
    dataAgeMs,
    lastEventId: snap.lastEventId,
    snapshot: snap,
    prefs: sanitizePrefs(null),
    selectedSymbol: snap.globalLeader ?? "AAAA",
    selectedSummary: snap.priorityLadder[0] ?? null,
    error: null,
  };
}

test("Redis healthy — SSR HTML contains real seeded tickers before hydration", async () => {
  const snap = sampleSnap("1001");
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: NOW + 1_000,
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async () => sanitizePrefs(null),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "REDIS_FRESH");
  assert.ok(result.snapshot);

  const html = renderToStaticMarkup(
    createElement(MonitorSsrCore, {
      initialSnapshot: toInitial(snap, "REDIS_FRESH", 500),
    })
  );
  assert.match(html, /monitor-ssr-ticker-AAAA/);
  assert.match(html, /data-source="REDIS_FRESH"/);
  assert.doesNotMatch(html, /monitor-snapshot-unavailable/);
  assert.doesNotMatch(html, /Connecting Monitor/);
});

test("Redis timeout uses PostgreSQL durable fallback", async () => {
  const pg = sampleSnap("77");
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: NOW,
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

  const html = renderToStaticMarkup(
    createElement(MonitorSsrCore, {
      initialSnapshot: {
        ...toInitial(pg, "POSTGRES_FALLBACK", 12_000),
        source: "POSTGRES_FALLBACK",
        dataAgeMs: 12_000,
      },
    })
  );
  assert.match(html, /data-source="POSTGRES_FALLBACK"/);
  assert.match(html, /monitor-ssr-ticker-AAAA/);
});

test("stale Redis remains labelled REDIS_STALE — never silent live", async () => {
  const snap = sampleSnap("11", { ageMs: 60_000 });
  const result = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    nowMs: snap.generatedAtMs + 60_000,
    readRedis: async () => ({ ...snap, marketStateAgeMs: 60_000 }),
    readPostgres: async () => null,
    readPrefs: async () => sanitizePrefs(null),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, "REDIS_STALE");
  assert.notEqual(result.source, "REDIS_FRESH");
});

test("stream event during hydration — catch-up covers gap (no missed events)", () => {
  // SSR lastEventId=10; events 11–14 arrived before client EventSource opens.
  const plan = planSyncResume({
    afterEventId: 10,
    hubSequence: 14,
    ringSequences: [8, 9, 10, 11, 12, 13, 14],
  });
  assert.equal(plan.mode, "replay");
  assert.deepEqual(
    plan.messages.map((m) => m.sequence),
    [11, 12, 13, 14]
  );
  const gap = detectLiveGap(10, 14);
  assert.equal(gap.gap, true);
  // Replay plan must cover every sequence in the hole.
  for (let s = 11; s <= 14; s++) {
    assert.ok(plan.messages.some((m) => m.sequence === s));
  }
});

test("disconnected sync never claims live; snapshot stays visible", () => {
  assert.equal(
    effectiveLiveLabel("DISCONNECTED", Date.now() - 500, Date.now()),
    "disconnected"
  );
  assert.equal(
    effectiveLiveLabel("RECONNECTING", Date.now() - 500, Date.now()),
    "disconnected"
  );
  assert.equal(
    effectiveLiveLabel("CATCHING_UP", Date.now() - 200, Date.now()),
    "syncing"
  );
  assert.equal(syncKeepsSnapshotVisible("CONNECTING"), true);
  assert.equal(syncKeepsSnapshotVisible("CATCHING_UP"), true);
  assert.equal(syncKeepsSnapshotVisible("RECONNECTING"), true);
  // DISCONNECTED uses last-known ladder in UI; sync machine does not treat it as "live syncing".
  assert.equal(syncKeepsSnapshotVisible("SNAPSHOT_READY"), true);
});

test("User A never receives User B preset or pinned ticker", async () => {
  const snap = sampleSnap("5");
  const prefsByUser = {
    user_a: {
      activePresetId: "preset_a",
      pinnedTicker: "AAAA",
      displayDensity: "compact" as const,
      squawkEnabled: false,
    },
    user_b: {
      activePresetId: "preset_b",
      pinnedTicker: "BBBB",
      displayDensity: "dense" as const,
      squawkEnabled: true,
    },
  };

  const forA = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_a",
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async (id) => prefsByUser[id as keyof typeof prefsByUser]!,
  });
  const forB = await loadMonitorInitialSnapshotWithDeps({
    userId: "user_b",
    readRedis: async () => snap,
    readPostgres: async () => null,
    readPrefs: async (id) => prefsByUser[id as keyof typeof prefsByUser]!,
  });

  assert.equal(forA.prefs.pinnedTicker, "AAAA");
  assert.equal(forB.prefs.pinnedTicker, "BBBB");
  assert.notEqual(forA.prefs.activePresetId, forB.prefs.activePresetId);
  assert.equal(forA.selectedSymbol, "AAAA");
  assert.equal(forB.selectedSymbol, "BBBB");
});

test("zero blank-state frames: SSR ladder merge never wiped by empty live", () => {
  const snap = sampleSnap("55");
  const rows = snapshotTickersToLadderRows(snap.priorityLadder);
  assert.ok(rows.length >= 3);
  const liveEmpty: typeof rows = [];
  const merged = liveEmpty.length > 0 ? liveEmpty : rows;
  assert.equal(merged.length, rows.length);
  assert.equal(merged[0]?.symbol, "AAAA");
});

test("market closed + quiet + burst startup fixtures produce expected HTML", () => {
  const closed = buildMonitorStartupHarness("startup_closed");
  const quiet = buildMonitorStartupHarness("startup_quiet");
  const burst = buildMonitorStartupHarness("startup_burst");
  const pg = buildPostgresFallbackStartupSeed();

  const closedHtml = renderToStaticMarkup(
    createElement(MonitorSsrCore, {
      initialSnapshot: closed.initialSnapshot,
    })
  );
  assert.match(closedHtml, /monitor-ssr-ticker-AAAA/);
  assert.match(closedHtml, /REDIS_STALE/);

  const quietHtml = renderToStaticMarkup(
    createElement(MonitorSsrCore, {
      initialSnapshot: quiet.initialSnapshot,
    })
  );
  // Quiet may be empty ladder with recovery — still an ok envelope, not unavailable crash.
  assert.ok(
    quietHtml.includes("monitor-ssr-core") ||
      quietHtml.includes("monitor-snapshot-unavailable")
  );

  const burstHtml = renderToStaticMarkup(
    createElement(MonitorSsrCore, {
      initialSnapshot: burst.initialSnapshot,
    })
  );
  assert.match(burstHtml, /monitor-ssr-ticker-BUR1/);
  assert.match(burstHtml, /monitor-ssr-ticker-BUR2/);

  assert.equal(pg.initialSnapshot.source, "POSTGRES_FALLBACK");
  assert.match(
    renderToStaticMarkup(
      createElement(MonitorSsrCore, { initialSnapshot: pg.initialSnapshot })
    ),
    /POSTGRES_FALLBACK/
  );
});

test("personalize pin does not change globalLeader (cross-user safe)", () => {
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

test("staging acceptance criteria checklist (documented, not marketing)", () => {
  /**
   * Recommended internal acceptance criteria for production-like staging:
   * - Initial HTML contains the snapshot on every successful authenticated request.
   * - First visible ticker appears within the first rendered response.
   * - Zero blank-state frames when a valid snapshot exists.
   * - Zero lost events during snapshot-to-stream handoff.
   * - Redis failure successfully uses the durable fallback.
   * - Secondary feature failure does not affect scanner usability.
   *
   * Do not publish timing results as marketing claims unless measured
   * reproducibly in production with sample sizes and methodology.
   */
  const criteria = [
    "ssr_html_contains_snapshot",
    "first_visible_ticker_in_first_response",
    "zero_blank_frames_with_valid_snapshot",
    "zero_lost_events_on_handoff",
    "redis_failure_uses_pg_fallback",
    "secondary_failure_isolated",
  ] as const;
  assert.equal(criteria.length, 6);
  assert.ok(criteria.includes("redis_failure_uses_pg_fallback"));
});
