/**
 * Monitor Event Tape — normalize, dedupe/cooldown/hysteresis, cluster,
 * filter, retention, catalog (no trade advice).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_TAPE_CONFIG,
  MONITOR_EVENT_TAPE_VERSION,
  MONITOR_TAPE_EVENT_TYPES,
  MemoryEventTapeStore,
  EventTapeEngine,
  TAPE_EVENT_CATALOG,
  catalogLooksLikeTradeAdvice,
  filterTapeItems,
  normalizeTapeSignal,
  type RawTapeSignal,
} from "../src/domain/monitor/event-tape/index.ts";
import { buildFixtureTapeSync } from "../src/components/monitor/event-tape/tape-fixtures.ts";
import { buildMonitorFixture } from "../src/components/monitor/monitor-fixtures.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

test("platform guide bumped for event tape", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 41);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-tape");
  assert.ok(step?.body.toLowerCase().includes("virtualized"));
  assert.ok(step?.body.toLowerCase().includes("not trade"));
});

test("catalog covers every normalized event type with explanations", () => {
  assert.equal(MONITOR_TAPE_EVENT_TYPES.length, 23);
  for (const type of MONITOR_TAPE_EVENT_TYPES) {
    const entry = TAPE_EVENT_CATALOG[type];
    assert.ok(entry.label, type);
    assert.ok(entry.explanation.length > 20, type);
    assert.ok(entry.intelSection, type);
    assert.equal(
      catalogLooksLikeTradeAdvice(entry.explanation),
      false,
      `${type} explanation looks like trade advice`
    );
    assert.equal(
      catalogLooksLikeTradeAdvice(entry.label),
      false,
      `${type} label looks like trade advice`
    );
  }
});

test("normalize produces required tape fields", () => {
  const item = normalizeTapeSignal({
    type: "VERIFIED_CATALYST",
    symbol: "aaaa",
    atMs: 1_700_000_000_000,
    detail: "Contract win.",
    dataConfidence: "high",
    sourceName: "Wire",
    sourceUrl: "https://example.com/a",
  });
  assert.ok(item);
  assert.equal(item!.symbol, "AAAA");
  assert.equal(item!.type, "VERIFIED_CATALYST");
  assert.ok(item!.label);
  assert.ok(item!.explanation.includes("Contract win"));
  assert.equal(item!.severity, "high");
  assert.equal(item!.sourceType, "catalyst");
  assert.equal(item!.dataConfidence, "high");
  assert.equal(item!.intelSection, "verified-catalyst");
  assert.equal(item!.ruleVersion, MONITOR_EVENT_TAPE_VERSION);
  assert.ok(item!.fingerprint.includes("AAAA"));
});

test("dedupe drops noisy repeats within cooldown", async () => {
  const engine = new EventTapeEngine({
    store: new MemoryEventTapeStore(),
    cooldownMs: 45_000,
    hysteresisMs: 20_000,
  });
  const base = 1_700_000_000_000;
  const signals: RawTapeSignal[] = [
    { type: "TRADE_RATE_BURST", symbol: "AAAA", atMs: base },
    { type: "TRADE_RATE_BURST", symbol: "AAAA", atMs: base + 8_000 },
    { type: "TRADE_RATE_BURST", symbol: "AAAA", atMs: base + 60_000 },
  ];
  const result = await engine.ingest(signals);
  assert.equal(result.accepted.length, 2);
  assert.ok(result.dropped.some((d) => d.reason === "cooldown" || d.reason === "duplicate"));
});

test("hysteresis suppresses opposite flip within window", async () => {
  const engine = new EventTapeEngine({
    store: new MemoryEventTapeStore(),
    cooldownMs: 1_000,
    hysteresisMs: 20_000,
  });
  const base = 1_700_000_100_000;
  const result = await engine.ingest([
    { type: "SPREAD_WIDENING", symbol: "DDDD", atMs: base },
    { type: "SPREAD_NORMALIZED", symbol: "DDDD", atMs: base + 5_000 },
    { type: "SPREAD_NORMALIZED", symbol: "DDDD", atMs: base + 30_000 },
  ]);
  assert.equal(result.accepted.length, 2);
  assert.ok(result.dropped.some((d) => d.reason === "hysteresis"));
  assert.equal(result.accepted[1]!.type, "SPREAD_NORMALIZED");
});

test("related events share a cluster id", async () => {
  const engine = new EventTapeEngine({
    store: new MemoryEventTapeStore(),
    cooldownMs: 1_000,
    hysteresisMs: 500,
    clusterWindowMs: 90_000,
  });
  const base = 1_700_000_200_000;
  const result = await engine.ingest([
    { type: "MOMENTUM_EMERGING", symbol: "AAAA", atMs: base },
    { type: "MOMENTUM_BUILDING", symbol: "AAAA", atMs: base + 10_000 },
    { type: "MOMENTUM_BREAKING", symbol: "AAAA", atMs: base + 20_000 },
  ]);
  assert.equal(result.accepted.length, 3);
  const ids = new Set(result.accepted.map((a) => a.clusterId));
  assert.equal(ids.size, 1);
  assert.ok([...ids][0]);
  assert.ok(result.accepted[2]!.clusterMemberIds.length >= 2);
});

test("filters: selected watchlist risk market", () => {
  // Use wall-clock-relative timestamps so retention prune does not wipe the set.
  const items = buildFixtureTapeSync(Date.now());
  assert.ok(items.length > 5);
  const selected = filterTapeItems(items, "selected", {
    selectedSymbol: "AAAA",
  });
  assert.ok(selected.every((i) => i.symbol === "AAAA"));
  const watch = filterTapeItems(items, "watchlist", {
    watchlist: ["AAAA", "FFFF"],
  });
  assert.ok(watch.every((i) => i.symbol === "AAAA" || i.symbol === "FFFF"));
  const risk = filterTapeItems(items, "risk");
  assert.ok(risk.some((i) => i.type === "HALTED" || i.type === "DILUTION_RISK"));
  const market = filterTapeItems(items, "market");
  assert.ok(market.some((i) => i.type.startsWith("MOMENTUM_") || i.type === "HOD_BREAK"));
});

test("retention store prunes beyond max items", async () => {
  const store = new MemoryEventTapeStore({
    maxItems: 5,
    retentionMs: EVENT_TAPE_CONFIG.retentionMs,
  });
  const engine = new EventTapeEngine({
    store,
    cooldownMs: 0,
    hysteresisMs: 0,
  });
  const base = 1_700_000_400_000;
  const signals: RawTapeSignal[] = [];
  for (let i = 0; i < 12; i++) {
    signals.push({
      type: "VOLUME_BURST",
      symbol: `S${i}`,
      atMs: base + i * 60_000,
    });
  }
  await engine.ingest(signals);
  const size = await store.size();
  assert.ok(size <= 5);
});

test("every accepted item has user-readable explanation", async () => {
  const items = buildFixtureTapeSync();
  for (const it of items) {
    assert.ok(it.explanation.trim().length > 10);
    assert.ok(it.atMs > 0);
    assert.ok(it.symbol);
    assert.ok(it.label);
    assert.ok(it.severity);
    assert.ok(it.sourceType);
    assert.ok(it.dataConfidence);
  }
});

test("monitor fixture includes normalized tape", () => {
  const vm = buildMonitorFixture("live");
  assert.ok(vm.tape.length > 0);
  assert.ok(vm.tape[0]!.type);
  assert.ok(vm.tape[0]!.explanation);
});
