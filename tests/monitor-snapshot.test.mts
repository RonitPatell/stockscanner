import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonitorPublicSnapshot,
  validateMonitorPublicSnapshot,
  decidePublishFreshness,
  publicSnapshotToDeliverySymbols,
  MONITOR_SNAPSHOT_MAX_LADDER,
  MONITOR_SNAPSHOT_MAX_FIELD,
  MONITOR_SNAPSHOT_MAX_TAPE,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
  type MonitorPublicSnapshot,
  type NormalizedSnapshotTickerInput,
} from "../src/domain/monitor/snapshot/index.ts";
import {
  MonitorSnapshotRedisStore,
  __resetMonitorSnapshotMemoryForTests,
} from "../src/lib/monitor/snapshot/redis-store.ts";
import { MonitorSnapshotPublisher } from "../src/lib/monitor/snapshot/publisher.ts";

const NOW = 1_700_000_100_000;

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
    price: 2.5,
    sessionChangePct: 12,
    quoteTimestampMs: NOW - 500,
    lastQuoteAtMs: NOW - 500,
    companyShortName: `${symbol} Inc`,
    provider: "hub",
    ...extra,
  };
}

function baseInput(tickers: NormalizedSnapshotTickerInput[], lastEventId = "100") {
  return {
    nowMs: NOW,
    lastEventId,
    marketSession: "regular" as const,
    tickers,
    tapeEvents: [
      {
        id: "t1",
        atMs: NOW - 10_000,
        symbol: "AAAA",
        type: "MOMENTUM_BUILDING",
        label: "Building",
        severity: "medium" as const,
        explanation: "Intensity rising",
      },
    ],
    marketStateAgeMs: 400,
  };
}

test("buildMonitorPublicSnapshot caps ladder/field/tape and sets leader", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    ticker(`S${String(i).padStart(2, "0")}`, 100 - i)
  );
  const tape = Array.from({ length: 80 }, (_, i) => ({
    id: `e${i}`,
    atMs: NOW - 50_000 + i,
    symbol: "S00",
    type: "VOLUME_BURST",
    label: "Burst",
    severity: "low" as const,
    explanation: "x",
  }));
  const snap = buildMonitorPublicSnapshot({
    ...baseInput(many, "42"),
    tapeEvents: tape,
  });

  assert.equal(snap.schemaVersion, MONITOR_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snap.priorityLadder.length, MONITOR_SNAPSHOT_MAX_LADDER);
  assert.equal(snap.momentumField.length, MONITOR_SNAPSHOT_MAX_FIELD);
  assert.equal(snap.recentEventTape.length, MONITOR_SNAPSHOT_MAX_TAPE);
  assert.equal(snap.globalLeader, "S00");
  assert.equal(snap.priorityLadder[0]?.rank, 1);
  assert.equal(snap.lastEventId, "42");
  assert.ok(snap.snapshotId.includes("42"));
  assert.equal(snap.freshness.liveEligible, true);
  assert.equal(snap.freshness.liveLabel, "live");
});

test("rankChange uses previous snapshot ranks", () => {
  const first = buildMonitorPublicSnapshot(
    baseInput([ticker("AAAA", 90), ticker("BBBB", 80)], "1")
  );
  const second = buildMonitorPublicSnapshot({
    ...baseInput([ticker("BBBB", 95), ticker("AAAA", 70)], "2"),
    previous: first,
  });
  const aaaa = second.priorityLadder.find((t) => t.symbol === "AAAA");
  const bbbb = second.priorityLadder.find((t) => t.symbol === "BBBB");
  assert.equal(bbbb?.rank, 1);
  assert.equal(bbbb?.rankChange, 1); // was 2, now 1 → +1 improvement as prev-rank
  assert.equal(aaaa?.rank, 2);
  assert.equal(aaaa?.rankChange, -1);
});

test("validate rejects forbidden private fields and incomplete meta", () => {
  const ok = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 50)]));
  assert.equal(validateMonitorPublicSnapshot(ok).ok, true);

  const dirty = {
    ...ok,
    userId: "u_secret",
  } as MonitorPublicSnapshot & { userId: string };
  const bad = validateMonitorPublicSnapshot(dirty);
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === "forbidden_field"));

  const incomplete = { ...ok, snapshotId: "" };
  assert.equal(validateMonitorPublicSnapshot(incomplete).ok, false);
});

test("decidePublishFreshness blocks older lastEventId unless recovery", () => {
  const a = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 50)], "10"));
  const older = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 50)], "9"));
  const newer = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 50)], "11"));
  assert.equal(decidePublishFreshness(older, a).allow, false);
  assert.equal(decidePublishFreshness(newer, a).allow, true);
  assert.equal(
    decidePublishFreshness({ ...older, recovery: true }, a).allow,
    true
  );
});

test("Redis store atomic swap keeps previous and rejects invalid", async () => {
  __resetMonitorSnapshotMemoryForTests();
  const store = new MonitorSnapshotRedisStore(null, { ttlSec: 60 });

  const a = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 80)], "1"));
  const r1 = await store.publish(a);
  assert.equal(r1.ok, true);
  assert.equal((await store.getActive())?.snapshotId, a.snapshotId);

  const b = buildMonitorPublicSnapshot(baseInput([ticker("BBBB", 90)], "2"));
  const r2 = await store.publish(b);
  assert.equal(r2.ok, true);
  assert.equal((await store.getActive())?.globalLeader, "BBBB");
  assert.equal((await store.getPrevious())?.snapshotId, a.snapshotId);

  const invalid = { ...b, snapshotId: "", lastEventId: "3" };
  const r3 = await store.publish(invalid);
  assert.equal(r3.ok, false);
  assert.equal((await store.getActive())?.snapshotId, b.snapshotId);

  const rolled = await store.rollbackToPrevious();
  assert.equal(rolled?.snapshotId, a.snapshotId);
  assert.equal((await store.getActive())?.snapshotId, a.snapshotId);
});

test("publisher coalesces and refuses stale overwrite", async () => {
  __resetMonitorSnapshotMemoryForTests();
  const store = new MonitorSnapshotRedisStore(null, { ttlSec: 60 });
  let now = 1_000;
  const publisher = new MonitorSnapshotPublisher({
    store,
    coalesceMs: 10_000,
    maxIntervalMs: 60_000,
    nowMs: () => now,
  });

  publisher.schedule(baseInput([ticker("AAAA", 50)], "5"), "event");
  const first = await publisher.flush("manual");
  assert.equal(first.ok, true);

  publisher.schedule(baseInput([ticker("AAAA", 50)], "4"), "event");
  const stale = await publisher.flush("manual");
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "stale_market_data");
  // Failed build must keep last valid active snapshot.
  assert.equal((await store.getActive())?.lastEventId, "5");

  publisher.schedule(
    { ...baseInput([ticker("CCCC", 99)], "4"), recovery: true },
    "recovery"
  );
  const recovered = await publisher.flush("recovery");
  assert.equal(recovered.ok, true);
  assert.equal((await store.getActive())?.globalLeader, "CCCC");
});

test("empty non-recovery snapshot is not published over valid active", async () => {
  __resetMonitorSnapshotMemoryForTests();
  const store = new MonitorSnapshotRedisStore(null, { ttlSec: 60 });
  const good = buildMonitorPublicSnapshot(baseInput([ticker("AAAA", 70)], "1"));
  assert.equal((await store.publish(good)).ok, true);

  const empty = buildMonitorPublicSnapshot({
    ...baseInput([], "2"),
    recovery: false,
  });
  const res = await store.publish(empty);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "not_renderable");
  assert.equal((await store.getActive())?.snapshotId, good.snapshotId);
});

test("stale ticker cannot become globalLeader; fresh second wins", () => {
  const snap = buildMonitorPublicSnapshot(
    baseInput(
      [
        ticker("STALE", 99, {
          lastQuoteAtMs: NOW - 120_000,
          quoteTimestampMs: NOW - 120_000,
        }),
        ticker("FRESH", 80, {
          lastQuoteAtMs: NOW - 400,
          quoteTimestampMs: NOW - 400,
        }),
      ],
      "55"
    )
  );
  assert.equal(snap.globalLeader, "FRESH");
  const stale = snap.priorityLadder.find((t) => t.symbol === "STALE");
  assert.equal(stale?.freshnessVerdict, "stale");
  assert.equal(stale?.leaderEligible, false);
  assert.ok(
    snap.freshness.leaderExclusions.some((e) => e.symbol === "STALE")
  );
});

test("quarantine and invalid symbols are excluded with reasons", () => {
  const snap = buildMonitorPublicSnapshot({
    ...baseInput(
      [
        ticker("KEEP", 70),
        ticker("BAD!!", 90),
        ticker("QZON", 85),
        ticker("CONF", 75, { conflictedMapping: true }),
      ],
      "7"
    ),
    quarantinedSymbols: ["QZON"],
  });
  assert.ok(snap.priorityLadder.every((t) => t.symbol === "KEEP"));
  assert.ok(
    snap.freshness.excludedTickers.some(
      (e) => e.reason === "invalid_symbol_resolution"
    )
  );
  assert.ok(
    snap.freshness.excludedTickers.some(
      (e) => e.symbol === "QZON" && e.stage === "quarantine"
    )
  );
  assert.ok(
    snap.freshness.excludedTickers.some(
      (e) => e.reason === "conflicted_ticker_mapping"
    )
  );
});

test("field freshness marks quote independently when trade missing", () => {
  const snap = buildMonitorPublicSnapshot(
    baseInput([
      ticker("AAAA", 60, {
        lastTradeAtMs: null,
        lastTradeAtQuality: "missing",
        momentumCalculatedAtMs: NOW - 200,
        momentumCalculatedAtQuality: "provider",
      }),
    ])
  );
  const t = snap.priorityLadder[0]!;
  const quote = t.fieldFreshness.find((f) => f.field === "quote");
  const trade = t.fieldFreshness.find((f) => f.field === "trade");
  assert.equal(quote?.verdict, "fresh");
  assert.equal(trade?.verdict, "unavailable");
  assert.equal(trade?.timeQuality, "missing");
});

test("live label ignores serialization age; uses underlying inputs", () => {
  const snap = buildMonitorPublicSnapshot({
    ...baseInput([
      ticker("AAAA", 50, {
        lastQuoteAtMs: NOW - 90_000,
        quoteTimestampMs: NOW - 90_000,
      }),
    ]),
    recovery: false,
  });
  // Snapshot was just built (serialization age 0) but underlying is stale.
  assert.equal(snap.freshness.snapshotAgeMs, 0);
  assert.ok((snap.freshness.underlyingDataAgeMs ?? 0) > 60_000);
  assert.equal(snap.freshness.liveEligible, false);
  assert.notEqual(snap.freshness.liveLabel, "live");
});

test("publicSnapshotToDeliverySymbols never substitutes generatedAt", () => {
  const snap = buildMonitorPublicSnapshot(
    baseInput([
      ticker("HAS", 70),
      ticker("MISS", 60, {
        lastQuoteAtMs: null,
        quoteTimestampMs: null,
        lastQuoteAtQuality: "missing",
        lastMarketEventAtMs: null,
        lastMarketEventAtQuality: "missing",
      }),
    ])
  );
  const rows = publicSnapshotToDeliverySymbols(snap);
  assert.ok(rows.every((r) => r.asOfMs !== snap.generatedAtMs));
  assert.ok(rows.every((r) => r.symbol !== "MISS" || r.asOfMs > 0));
  assert.equal(
    rows.find((r) => r.symbol === "MISS"),
    undefined
  );
  assert.ok(rows.some((r) => r.symbol === "HAS"));
});
