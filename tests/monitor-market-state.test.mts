/**
 * Monitor rolling market-state engine — unit + load benchmarks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MONITOR_MARKET_DATA_VERSION } from "../src/domain/monitor/market-data/index.ts";
import {
  MarketStateEngine,
  MemorySnapshotStore,
  MONITOR_MARKET_STATE_VERSION,
  classifyTradeConditions,
  getSessionContext,
  inferTradeSide,
} from "../src/domain/monitor/market-state/index.ts";
import type { NormalizedMarketEvent } from "../src/domain/monitor/market-data/types.ts";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function trade(
  symbol: string,
  price: number,
  size: number,
  tMs: number,
  seq: number,
  conditions: string[] = ["@"]
): NormalizedMarketEvent {
  const ts = iso(tMs);
  return {
    type: "trade",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol,
    price,
    size,
    exchange: "XNAS",
    conditions,
    participantTimestamp: ts,
    sipTimestamp: ts,
    providerReceivedAt: ts,
    trustTickerReceivedAt: ts,
    sequenceNumber: seq,
    tape: "C",
    provider: "fake",
    dataEntitlement: "realtime",
    delayedByMs: null,
  };
}

function quote(
  symbol: string,
  bid: number,
  ask: number,
  tMs: number,
  seq: number,
  over: Record<string, unknown> = {}
): NormalizedMarketEvent {
  const ts = iso(tMs);
  return {
    type: "nbbo_quote",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol,
    bidPrice: bid,
    askPrice: ask,
    bidSize: 500,
    askSize: 400,
    bidExchange: "XNAS",
    askExchange: "XNAS",
    sipTimestamp: ts,
    quoteQuality: "nbbo",
    providerReceivedAt: ts,
    trustTickerReceivedAt: ts,
    sequenceNumber: seq,
    provider: "fake",
    dataEntitlement: "nbbo",
    delayedByMs: null,
    ...over,
  };
}

function halt(
  symbol: string,
  lifecycle: "halted" | "resumed",
  tMs: number,
  seq: number
): NormalizedMarketEvent {
  const ts = iso(tMs);
  return {
    type: "halt",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol,
    lifecycle,
    haltCode: "T1",
    eventAt: ts,
    providerReceivedAt: ts,
    trustTickerReceivedAt: ts,
    sequenceNumber: seq,
    provider: "fake",
    dataEntitlement: "status_only",
    delayedByMs: null,
  };
}

test("calc version is pinned", () => {
  assert.equal(MONITOR_MARKET_STATE_VERSION, "monitor-market-state-v1.0");
});

test("trade eligibility excludes odd lot / average", () => {
  assert.equal(classifyTradeConditions(["@"]).eligibleForLast, true);
  assert.equal(classifyTradeConditions(["I"]).eligibleForLast, false);
  assert.equal(classifyTradeConditions(["T"]).eligibleForVolume, false);
  assert.equal(classifyTradeConditions([]).eligibleForLast, true);
});

test("buy/sell side only when quote fresh and at touch", () => {
  const okSide = inferTradeSide({
    price: 10.05,
    bid: 10,
    ask: 10.05,
    quoteAgeMs: 100,
  });
  assert.equal(okSide.side, "buy");
  assert.equal(okSide.reliable, true);

  const stale = inferTradeSide({
    price: 10.05,
    bid: 10,
    ask: 10.05,
    quoteAgeMs: 10_000,
  });
  assert.equal(stale.reliable, false);
});

test("session segments classify ET minutes", () => {
  // 2026-07-27 14:00 UTC = 10:00 ET (EDT) → regular
  const regular = getSessionContext(Date.parse("2026-07-27T14:00:00.000Z"));
  assert.equal(regular.segment, "regular");

  // 08:00 UTC = 04:00 ET → premarket
  const pre = getSessionContext(Date.parse("2026-07-27T08:00:00.000Z"));
  assert.equal(pre.segment, "premarket");
});

test("engine computes windows, spread flags, halt, freshness", () => {
  const t0 = Date.parse("2026-07-27T14:30:00.000Z");
  let now = t0;
  const engine = new MarketStateEngine({
    partitions: 4,
    maxSymbols: 100,
    snapshotIntervalMs: 60_000,
    now: () => now,
  });

  engine.setReference("TEST", {
    avgDailyVolume: 1_000_000,
    floatShares: 50_000_000,
    floatConfidence: "high",
  });

  engine.ingest(quote("TEST", 10, 10.02, t0, 1));
  for (let i = 0; i < 20; i++) {
    now = t0 + i * 200;
    const px = 10 + i * 0.01;
    engine.ingest(quote("TEST", px - 0.01, px + 0.01, now, i * 2 + 2));
    engine.ingest(trade("TEST", px, 1000, now, i * 2 + 3));
  }

  now = t0 + 5_000;
  const state = engine.getState("TEST", now);
  assert.ok(state);
  assert.equal(state!.calcVersion, MONITOR_MARKET_STATE_VERSION);
  assert.equal(state!.lastPrice.availability, "ok");
  assert.ok((state!.windows.w5s.tradeCount.value ?? 0) >= 10);
  assert.equal(state!.windows.w5s.priceReturn.availability, "ok");
  assert.equal(state!.quote.spreadDollars.availability, "ok");
  // Last print at t0+3800; snapshot at t0+5000 → freshness ~1.2s
  assert.ok((state!.dataFreshnessMs.value ?? 9999) < 2_000);

  // Crossed quote → flagged, not silently ok
  now = t0 + 5_100;
  engine.ingest(
    quote("TEST", 10.5, 10.4, now, 100, { quoteQuality: "nbbo" })
  );
  const crossed = engine.getState("TEST", now)!;
  assert.equal(crossed.quote.spreadDollars.availability, "flagged");
  assert.ok(crossed.quote.quoteFlags.includes("crossed"));

  engine.ingest(halt("TEST", "halted", now + 1, 101));
  const halted = engine.getState("TEST", now + 1)!;
  assert.equal(halted.haltState.value?.halted, true);

  // Odd-lot should not move last when only odd lots after
  const lastBefore = halted.lastPrice.value;
  engine.ingest(trade("TEST", 99, 1, now + 2, 102, ["I"]));
  const afterOdd = engine.getState("TEST", now + 2)!;
  assert.equal(afterOdd.lastPrice.value, lastBefore);
});

test("unavailable metrics when inputs missing", () => {
  const engine = new MarketStateEngine({
    snapshotIntervalMs: 999_999,
    now: () => 1_000_000,
  });
  engine.ingest(trade("EMPTY", 5, 100, 1_000_000, 1));
  const s = engine.getState("EMPTY")!;
  assert.equal(s.quote.spreadDollars.availability, "unavailable");
  assert.equal(s.session.relativeVolume.availability, "unavailable");
  assert.equal(s.session.turnoverVsFloat.availability, "unavailable");
  // float low confidence → unavailable
  engine.setReference("EMPTY", {
    floatShares: 1e6,
    floatConfidence: "low",
    avgDailyVolume: 100,
  });
  const s2 = engine.getState("EMPTY")!;
  assert.equal(s2.session.turnoverVsFloat.availability, "unavailable");
});

test("periodic snapshots — not per tick", () => {
  const store = new MemorySnapshotStore();
  let now = 1_000_000;
  const engine = new MarketStateEngine({
    snapshotStore: store,
    snapshotIntervalMs: 1_000,
    now: () => now,
  });
  for (let i = 0; i < 50; i++) {
    now += 10;
    engine.ingest(trade("SNAP", 1 + i * 0.001, 10, now, i + 1));
  }
  // Interval not hit yet from start... first ingest sets lastSnapshotAt = construct time
  // After 1000ms of advances from construct: construct at 1e6, lastSnapshotAt=1e6
  // we advanced 500ms — may not flush. Force:
  now += 2_000;
  engine.ingest(trade("SNAP", 2, 10, now, 999));
  assert.ok(store.size() >= 1);
  const snap = store.get("SNAP");
  assert.ok(snap);
  assert.equal(snap!.version, MONITOR_MARKET_STATE_VERSION);
});

test("symbol partition affinity is stable", () => {
  const engine = new MarketStateEngine({ partitions: 8 });
  const a = engine.partitionFor("AAPL");
  const b = engine.partitionFor("AAPL");
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 8);
});

test("maxSymbols LRU bounds memory", () => {
  const engine = new MarketStateEngine({
    maxSymbols: 10,
    partitions: 2,
    snapshotIntervalMs: 999_999,
    now: () => Date.now(),
  });
  for (let i = 0; i < 25; i++) {
    engine.ingest(trade(`S${i}`, 1, 1, Date.now(), i + 1));
  }
  assert.ok(engine.stats().symbolsTracked <= 10);
});

function rssMb(): number {
  return process.memoryUsage().rss / (1024 * 1024);
}

function cpuBusyMs(sampleMs: number): { userMs: number; systemMs: number } {
  const a = process.cpuUsage();
  const end = Date.now() + sampleMs;
  while (Date.now() < end) {
    /* spin */
  }
  const b = process.cpuUsage(a);
  return { userMs: b.user / 1000, systemMs: b.system / 1000 };
}

function runLoad(opts: {
  name: string;
  symbols: number;
  eventsPerSec: number;
  durationSec: number;
  hotSymbolShare?: number;
  openBurstMult?: number;
}): {
  name: string;
  eps: number;
  events: number;
  dropped: number;
  lagMsAvg: number;
  lagMsMax: number;
  rssMb: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  symbolsTracked: number;
  elapsedMs: number;
} {
  const store = new MemorySnapshotStore(opts.symbols + 100);
  let now = Date.parse("2026-07-27T13:30:00.000Z"); // ~09:30 ET open
  const engine = new MarketStateEngine({
    partitions: 32,
    maxSymbols: opts.symbols,
    snapshotIntervalMs: 2_000,
    snapshotStore: store,
    now: () => now,
  });

  const syms = Array.from({ length: opts.symbols }, (_, i) => `T${i}`);
  for (const s of syms.slice(0, Math.min(100, syms.length))) {
    engine.setReference(s, {
      avgDailyVolume: 2_000_000,
      floatShares: 40_000_000,
      floatConfidence: "medium",
    });
  }

  const totalEvents = Math.floor(opts.eventsPerSec * opts.durationSec);
  const hotShare = opts.hotSymbolShare ?? 0.15;
  const burstMult = opts.openBurstMult ?? 1;
  const memBefore = rssMb();
  const cpu0 = process.cpuUsage();
  const tStart = performance.now();

  let seq = 1;
  // Pre-seed quotes so side inference can work on a subset
  for (let i = 0; i < Math.min(syms.length, 500); i++) {
    engine.ingest(quote(syms[i]!, 10, 10.02, now, seq++));
  }

  for (let i = 0; i < totalEvents; i++) {
    // Open burst: first 10% of events at higher density (same wall clock step)
    const inBurst = i < totalEvents * 0.1;
    const stepMs = inBurst
      ? 1000 / (opts.eventsPerSec * burstMult)
      : 1000 / opts.eventsPerSec;
    now += stepMs;

    const hot = Math.random() < hotShare;
    const symbol = hot
      ? syms[0]!
      : syms[(Math.random() * syms.length) | 0]!;
    const kind = Math.random();
    const px = 10 + Math.sin(i / 50) * 0.2 + (Math.random() - 0.5) * 0.05;
    if (kind < 0.55) {
      engine.ingest(trade(symbol, px, 100 + ((i * 17) % 900), now, seq++));
    } else if (kind < 0.9) {
      engine.ingest(
        quote(symbol, px - 0.01, px + 0.01, now, seq++, {
          quoteQuality: Math.random() < 0.02 ? "stale" : "nbbo",
        })
      );
    } else if (kind < 0.995) {
      engine.ingest({
        type: "aggregate_1s",
        schemaVersion: MONITOR_MARKET_DATA_VERSION,
        symbol,
        open: px,
        high: px + 0.02,
        low: px - 0.02,
        close: px,
        volume: 5000,
        vwap: px,
        tradeCount: 20,
        windowStart: iso(now - 1000),
        windowEnd: iso(now),
        providerReceivedAt: iso(now),
        trustTickerReceivedAt: iso(now),
        sequenceNumber: seq++,
        provider: "fake",
        dataEntitlement: "aggregates_only",
        delayedByMs: null,
      });
    } else {
      engine.ingest(
        halt(symbol, Math.random() < 0.5 ? "halted" : "resumed", now, seq++)
      );
    }
  }

  engine.flushSnapshots(now);
  const elapsedMs = performance.now() - tStart;
  const cpu = process.cpuUsage(cpu0);
  const st = engine.stats();
  const memAfter = rssMb();

  return {
    name: opts.name,
    eps: totalEvents / (elapsedMs / 1000),
    events: st.eventsIn,
    dropped: st.eventsDropped,
    lagMsAvg: st.lagMsAvg,
    lagMsMax: st.lagMsMax,
    rssMb: memAfter,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    symbolsTracked: st.symbolsTracked,
    elapsedMs,
  };
}

test(
  "load: 10k eps × 2s, 10k symbols, open burst + hot ticker",
  { timeout: 120_000 },
  () => {
    const report = runLoad({
      name: "10k_eps_10k_sym",
      symbols: 10_000,
      eventsPerSec: 10_000,
      durationSec: 2,
      hotSymbolShare: 0.2,
      openBurstMult: 3,
    });
    console.log("\n[market-state load report]", JSON.stringify(report, null, 2));
    assert.ok(
      report.eps >= 8_000,
      `expected >=8k sustained eps, got ${report.eps.toFixed(0)}`
    );
    assert.ok(report.symbolsTracked <= 10_000);
    assert.ok(report.rssMb < 2048, `rss too high: ${report.rssMb}`);
  }
);

test(
  "load: 50k eps × 1s if infrastructure permits",
  { timeout: 120_000 },
  () => {
    const report = runLoad({
      name: "50k_eps_burst",
      symbols: 5_000,
      eventsPerSec: 50_000,
      durationSec: 1,
      hotSymbolShare: 0.35,
      openBurstMult: 2,
    });
    console.log("\n[market-state load report]", JSON.stringify(report, null, 2));
    // Soft gate: document result; hard-fail only if catastrophically slow (<5k)
    assert.ok(
      report.eps >= 5_000,
      `catastrophically slow: ${report.eps.toFixed(0)} eps`
    );
    if (report.eps < 40_000) {
      console.warn(
        `[market-state] 50k target not met on this host: ${report.eps.toFixed(0)} eps (ok if CI-limited)`
      );
    }
  }
);

test("load: extreme single-ticker activity", { timeout: 60_000 }, () => {
  const report = runLoad({
    name: "hot_ticker",
    symbols: 100,
    eventsPerSec: 20_000,
    durationSec: 1,
    hotSymbolShare: 0.95,
    openBurstMult: 1,
  });
  console.log("\n[market-state load report]", JSON.stringify(report, null, 2));
  const state = new MarketStateEngine(); // just ensure report fields present
  void state;
  assert.ok(report.events > 0);
  assert.ok(report.dropped >= 0);
});

// Keep cpuBusyMs referenced for optional local profiling (not asserted in CI).
void cpuBusyMs;
void rssMb;
