/**
 * Vendor-neutral Monitor market-data abstraction tests.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MarketDataIngestPipeline,
  MONITOR_MARKET_DATA_VERSION,
  ReconnectController,
  __resetHealthSequenceForTests,
  assertSubscribeAllowed,
  buildConnectionHealth,
  conservativePlanEntitlements,
  detectTradePriceDisagreement,
  isDelayedEntitlement,
  isQuoteStale,
  lastTradeFromNormalized,
  reconnectDelayMs,
  redactProviderSecrets,
  validateMarketEvent,
} from "../src/domain/monitor/market-data/index.ts";
import { FakeMarketDataProvider } from "../src/adapters/monitor/market-data/fake-provider.ts";
import { toNormalizedTrade } from "../src/adapters/monitor/market-data/finnhub-trade-adapter.ts";
import { yahooSnapshotToAggregate1s } from "../src/adapters/monitor/market-data/yahoo-aggregate-adapter.ts";

function baseTrade(over: Record<string, unknown> = {}) {
  const now = "2026-08-01T15:00:00.000Z";
  return {
    type: "trade",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol: "AAPL",
    price: 190.5,
    size: 100,
    exchange: "XNAS",
    conditions: ["@"],
    participantTimestamp: now,
    sipTimestamp: now,
    providerReceivedAt: now,
    trustTickerReceivedAt: now,
    sequenceNumber: 1,
    tape: "C",
    provider: "fake",
    dataEntitlement: "realtime",
    delayedByMs: null,
    ...over,
  };
}

function realtimePlan() {
  return {
    realtimeTrades: true,
    realtimeNbbo: true,
    delayedOk: true,
    aggregates: true,
    luld: true,
    haltStatus: true,
    maxSymbols: 100,
    delayMsWhenDelayed: 15 * 60_000,
  };
}

test("rejects invalid prices", () => {
  const bad = validateMarketEvent(baseTrade({ price: -1 }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.some((e) => e.includes("price")));

  const zero = validateMarketEvent(baseTrade({ price: 0 }));
  assert.equal(zero.ok, false);

  const nan = validateMarketEvent(baseTrade({ price: Number.NaN }));
  assert.equal(nan.ok, false);
});

test("rejects invalid sizes and timestamps", () => {
  const size = validateMarketEvent(baseTrade({ size: -5 }));
  assert.equal(size.ok, false);

  const ts = validateMarketEvent(baseTrade({ sipTimestamp: "not-a-date" }));
  assert.equal(ts.ok, false);
});

test("rejects provider clock skew (future timestamps)", () => {
  const future = new Date(Date.now() + 60 * 60_000).toISOString();
  const r = validateMarketEvent(baseTrade({ sipTimestamp: future }), {
    nowMs: Date.now(),
    maxClockSkewMs: 5_000,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("clock_skew")));
});

test("detects duplicate trades", () => {
  const pipe = new MarketDataIngestPipeline({ plan: realtimePlan() });
  const t = baseTrade({ sequenceNumber: 1 });
  assert.equal(pipe.ingest(t).ok, true);
  const dup = pipe.ingest(t);
  assert.equal(dup.ok, false);
  assert.equal(dup.sequence?.disposition, "duplicate");
});

test("detects out-of-order sequence", () => {
  const pipe = new MarketDataIngestPipeline({ plan: realtimePlan() });
  assert.equal(pipe.ingest(baseTrade({ sequenceNumber: 1 })).ok, true);
  assert.equal(pipe.ingest(baseTrade({ sequenceNumber: 2, price: 191 })).ok, true);
  // Sequence 0 never seen but behind high-water mark → out_of_order (not duplicate)
  const ooo = pipe.ingest(baseTrade({ sequenceNumber: 0, price: 189 }));
  assert.equal(ooo.ok, false);
  assert.equal(ooo.sequence?.disposition, "out_of_order");
});

test("detects sequence gaps and supports backfill", async () => {
  const gaps: Array<{ from: number; to: number }> = [];
  const fake = new FakeMarketDataProvider({
    sleep: async () => {},
    random: () => 0.5,
  });
  await fake.connect();

  const pipe = new MarketDataIngestPipeline({
    plan: realtimePlan(),
    onGap: (req) => gaps.push({ from: req.fromSequence, to: req.toSequence }),
  });

  // Seed sequences 1 and 2 into fake log without going through gap path
  fake.emitTrade({
    symbol: "MSFT",
    price: 400,
    size: 10,
    exchange: "XNAS",
    conditions: [],
    participantTimestamp: "2026-08-01T15:00:00.000Z",
    sipTimestamp: "2026-08-01T15:00:00.000Z",
    providerReceivedAt: "2026-08-01T15:00:00.000Z",
    dataEntitlement: "realtime",
    tape: "C",
    sequenceNumber: 1,
  });
  fake.emitTrade({
    symbol: "MSFT",
    price: 401,
    size: 10,
    exchange: "XNAS",
    conditions: [],
    participantTimestamp: "2026-08-01T15:00:01.000Z",
    sipTimestamp: "2026-08-01T15:00:01.000Z",
    providerReceivedAt: "2026-08-01T15:00:01.000Z",
    dataEntitlement: "realtime",
    tape: "C",
    sequenceNumber: 2,
  });

  // Fresh pipeline: accept 1, then jump to 3 → gap at 2
  const p2 = new MarketDataIngestPipeline({
    plan: realtimePlan(),
    onGap: (req) => gaps.push({ from: req.fromSequence, to: req.toSequence }),
  });
  assert.ok(
    p2.ingest(
      baseTrade({
        symbol: "MSFT",
        sequenceNumber: 1,
        price: 400,
        sipTimestamp: "2026-08-01T15:00:00.000Z",
        participantTimestamp: "2026-08-01T15:00:00.000Z",
        providerReceivedAt: "2026-08-01T15:00:00.000Z",
        trustTickerReceivedAt: "2026-08-01T15:00:00.050Z",
      })
    ).ok
  );
  const jumped = p2.ingest(
    baseTrade({
      symbol: "MSFT",
      sequenceNumber: 3,
      price: 402,
      sipTimestamp: "2026-08-01T15:00:02.000Z",
      participantTimestamp: "2026-08-01T15:00:02.000Z",
      providerReceivedAt: "2026-08-01T15:00:02.000Z",
      trustTickerReceivedAt: "2026-08-01T15:00:02.050Z",
    })
  );
  assert.equal(jumped.ok, true);
  assert.equal(jumped.sequence?.disposition, "sequence_gap");
  assert.deepEqual(gaps.at(-1), { from: 2, to: 2 });

  const filled = await fake.backfillGaps({
    symbol: "MSFT",
    fromSequence: 2,
    toSequence: 2,
    channel: "trades",
  });
  assert.equal(filled.length, 1);
  const fillResult = p2.ingest(filled[0], { allowGapFill: true });
  assert.equal(fillResult.ok, true);
});

test("reconnect uses exponential backoff with jitter", async () => {
  const delays: number[] = [];
  const ctrl = new ReconnectController({
    baseMs: 100,
    maxMs: 10_000,
    random: () => 1 - Number.EPSILON, // near max of full jitter
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  await ctrl.waitAndReconnect(async () => {});
  await ctrl.waitAndReconnect(async () => {});
  await ctrl.waitAndReconnect(async () => {});
  assert.equal(delays.length, 3);
  assert.ok(delays[0] <= 100);
  assert.ok(delays[1] <= 200);
  assert.ok(delays[2] <= 400);
  // Monotonic ceiling growth of max bound
  assert.ok(
    reconnectDelayMs({ attempt: 5, baseMs: 100, maxMs: 1_000, random: () => 0.99 }) <=
      1_000
  );

  const fake = new FakeMarketDataProvider({
    sleep: async () => {},
    random: () => 0.25,
  });
  await fake.connect();
  const r = await fake.simulateReconnect();
  assert.ok(r.attempt >= 1);
});

test("stale quotes detected by age and quality", () => {
  const now = Date.parse("2026-08-01T15:00:10.000Z");
  const fresh = isQuoteStale(
    {
      sipTimestamp: "2026-08-01T15:00:09.500Z",
      quoteQuality: "nbbo",
    },
    { nowMs: now, maxAgeMs: 2_000 }
  );
  assert.equal(fresh.stale, false);

  const aged = isQuoteStale(
    {
      sipTimestamp: "2026-08-01T15:00:00.000Z",
      quoteQuality: "nbbo",
    },
    { nowMs: now, maxAgeMs: 2_000 }
  );
  assert.equal(aged.stale, true);
  assert.equal(aged.reason, "age_exceeded");

  const marked = isQuoteStale(
    {
      sipTimestamp: "2026-08-01T15:00:09.900Z",
      quoteQuality: "stale",
    },
    { nowMs: now, maxAgeMs: 5_000 }
  );
  assert.equal(marked.stale, true);
  assert.equal(marked.reason, "quality_stale");
});

test("delayed versus realtime data marked explicitly", () => {
  const rt = baseTrade({ dataEntitlement: "realtime", delayedByMs: null });
  assert.equal(isDelayedEntitlement(rt as never), false);

  const delayed = baseTrade({
    dataEntitlement: "delayed",
    delayedByMs: 900_000,
  });
  assert.equal(isDelayedEntitlement(delayed as never), true);

  const plan = conservativePlanEntitlements();
  const pipe = new MarketDataIngestPipeline({ plan });
  // realtime trade on delayed-only plan → stamped delayed
  const r = pipe.ingest(baseTrade({ dataEntitlement: "realtime" }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.event.dataEntitlement, "delayed");
    assert.ok((r.event.delayedByMs ?? 0) > 0);
  }
});

test("two providers disagreeing on trade price", () => {
  const a = lastTradeFromNormalized(
    baseTrade({
      provider: "finnhub",
      price: 100,
      sequenceNumber: 1,
    }) as never
  );
  const b = lastTradeFromNormalized(
    baseTrade({
      provider: "yahoo",
      price: 101.5,
      sequenceNumber: 1,
    }) as never
  );
  const d = detectTradePriceDisagreement(a, b, { symbol: "AAPL", absTol: 0.05 });
  assert.ok(d);
  assert.equal(d!.field, "trade.price");
  assert.ok(d!.maxAbsDiff >= 1.4);

  const agree = detectTradePriceDisagreement(
    a,
    { ...b, price: 100.01 },
    { symbol: "AAPL", absTol: 0.05, relTol: 0.01 }
  );
  assert.equal(agree, null);
});

test("entitlements block subscribe beyond plan", () => {
  assert.throws(
    () =>
      assertSubscribeAllowed({
        symbols: Array.from({ length: 50 }, (_, i) => `S${i}`),
        channels: ["trades"],
        entitlements: conservativePlanEntitlements(),
      }),
    /symbol_limit/
  );
});

test("finnhub and yahoo adapters produce valid events", () => {
  const trade = toNormalizedTrade(
    { s: "AAPL", p: 190.25, v: 50, t: Date.parse("2026-08-01T15:00:00.000Z") },
    { sequenceNumber: 7 }
  );
  const v = validateMarketEvent(trade);
  assert.equal(v.ok, true);

  const agg = yahooSnapshotToAggregate1s(
    { symbol: "AAPL", price: 190.25, volume: 1_000_000 },
    {
      sequenceNumber: 1,
      windowStart: "2026-08-01T15:00:00.000Z",
      windowEnd: "2026-08-01T15:00:01.000Z",
    }
  );
  assert.equal(agg.dataEntitlement, "delayed");
  assert.equal(validateMarketEvent(agg).ok, true);
});

test("secrets are redacted and never placed on health events", () => {
  const red = redactProviderSecrets({
    apiKey: "secret-value",
    price: 1,
  });
  assert.equal(red.apiKey, "[redacted]");
  assert.equal(red.price, 1);

  const h = buildConnectionHealth({
    provider: "finnhub",
    state: "failed",
    lastError: "unauthorized",
  });
  assert.equal(h.type, "connection_health");
  assert.ok(!JSON.stringify(h).toLowerCase().includes("secret-value"));
  __resetHealthSequenceForTests();
});

test("NBBO ask below bid rejected", () => {
  const now = "2026-08-01T15:00:00.000Z";
  const r = validateMarketEvent({
    type: "nbbo_quote",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol: "AAPL",
    bidPrice: 191,
    bidSize: 100,
    askPrice: 190,
    askSize: 100,
    bidExchange: "XNAS",
    askExchange: "XNYS",
    sipTimestamp: now,
    providerReceivedAt: now,
    trustTickerReceivedAt: now,
    sequenceNumber: 1,
    provider: "fake",
    dataEntitlement: "nbbo",
    quoteQuality: "nbbo",
  });
  assert.equal(r.ok, false);
});

test("preserves exchange and trade conditions", () => {
  const pipe = new MarketDataIngestPipeline({ plan: realtimePlan() });
  const r = pipe.ingest(
    baseTrade({
      exchange: "ARCX",
      conditions: ["@", "F"],
      tape: "A",
    })
  );
  assert.equal(r.ok, true);
  if (r.ok && r.event.type === "trade") {
    assert.equal(r.event.exchange, "ARCX");
    assert.deepEqual(r.event.conditions, ["@", "F"]);
    assert.equal(r.event.tape, "A");
  }
});
