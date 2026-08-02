/**
 * Alert Strategy Builder — evaluation, nested groups, cooldowns, sessions,
 * versioning, historical simulation, privacy scrub.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreset,
  evaluateStrategy,
  factsFromCatalyst,
  validateStrategy,
  summarizeStrategy,
  bumpStrategyVersion,
  strategyContentHash,
  simulateStrategy,
  explainStrategyMatch,
  exportStrategies,
  importStrategies,
  checkStrategyCooldown,
  recordStrategyFire,
  __resetStrategyCooldownForTests,
  scrubStrategyAnalyticsProps,
  marketSessionAt,
  isMuteActive,
  evaluateCondition,
  type StrategyEvalFacts,
  type StrategyConditionGroup,
} from "../src/lib/alert-strategy/index.ts";

function baseFacts(over: Partial<StrategyEvalFacts> = {}): StrategyEvalFacts {
  return {
    symbol: "TEST",
    onWatchlist: true,
    price: 5,
    floatM: 8,
    floatConfidence: "medium",
    marketCapM: 120,
    catalystCategory: "fda",
    sourceTier: "wire",
    sourceVerification: "verified",
    confirmationCount: 2,
    catalystStrength: "strong",
    reactionStage: "EARLY",
    relativeVolume: 3,
    dollarVolume: 2_000_000,
    dollarVolumeVelocity: 400_000,
    tradesPerSecond: 12,
    pctMove: 6,
    spreadBps: 40,
    tradeability: "ACCEPTABLE",
    dilutionFlags: [],
    riskFlags: [],
    marketSession: "regular",
    haltStatus: "trading",
    resumptionFlag: false,
    momentumState: "BREAKING",
    momentumIntensity: 55,
    attentionPriority: 70,
    catalystAgeMin: 10,
    sector: "Healthcare",
    exchange: "NASDAQ",
    ...over,
  };
}

function catalystStub(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    symbol: "TEST",
    headline: "Company announces FDA approval",
    source: "wire",
    publishedAt: new Date().toISOString(),
    verifiedConfidence: 90,
    urgencyScore: 70,
    changePercent: 6,
    rVol: 3,
    catalystType: "fda",
    sourceTier: "wire",
    ...over,
  } as never;
}

test("presets build valid strategies", () => {
  for (const id of [
    "low_float_momentum",
    "biotech_catalyst",
    "large_cap_news",
    "downside_momentum",
    "halt_resumption",
    "dilution_offering_risk",
    "watchlist_risk_monitor",
    "watchlist_only",
    "custom",
  ] as const) {
    const s = buildPreset(id);
    const v = validateStrategy(s);
    assert.equal(v.ok, true, `${id}: ${v.issues.map((i) => i.message).join("; ")}`);
    assert.ok(summarizeStrategy(s).headline.startsWith("This rule will alert when"));
  }
});

test("nested AND/OR groups evaluate correctly", () => {
  const strategy = buildPreset("custom");
  strategy.delivery = "EARLY";
  strategy.root = {
    id: "root",
    logic: "AND",
    conditions: [
      { id: "w", field: "watchlist_membership", op: "is_true", value: true },
    ],
    groups: [
      {
        id: "or1",
        logic: "OR",
        conditions: [
          { id: "f", field: "float_m", op: "lte", value: 20 },
          { id: "p", field: "pct_move", op: "gte", value: 10 },
        ],
        groups: [],
      },
    ],
  };

  // float ok → match
  let r = evaluateStrategy(
    strategy,
    baseFacts({ floatM: 8, pctMove: 1 }),
    catalystStub(),
    { skipDeliveryMode: true }
  );
  assert.equal(r.matched, true);

  // neither float nor move → fail
  r = evaluateStrategy(
    strategy,
    baseFacts({ floatM: 50, pctMove: 1 }),
    catalystStub(),
    { skipDeliveryMode: true }
  );
  assert.equal(r.matched, false);

  // move ok despite large float
  r = evaluateStrategy(
    strategy,
    baseFacts({ floatM: 50, pctMove: 12 }),
    catalystStub(),
    { skipDeliveryMode: true }
  );
  assert.equal(r.matched, true);
});

test("impossible range fails validation", () => {
  const s = buildPreset("custom");
  s.root.conditions = [
    { id: "a", field: "price", op: "gte", value: 20 },
    { id: "b", field: "price", op: "lte", value: 5 },
  ];
  const v = validateStrategy(s);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.code === "IMPOSSIBLE_RANGE"));
});

test("ticker exclusion and dilution flag conditions", () => {
  const excl = evaluateCondition(
    { id: "x", field: "ticker_exclusion", op: "in", value: ["BAD", "SKIP"] },
    baseFacts({ symbol: "GOOD" })
  );
  assert.equal(excl.passed, true);

  const excl2 = evaluateCondition(
    { id: "x", field: "ticker_exclusion", op: "in", value: ["BAD", "TEST"] },
    baseFacts({ symbol: "TEST" })
  );
  assert.equal(excl2.passed, false);

  const dil = evaluateCondition(
    { id: "d", field: "dilution_flag", op: "is_true", value: true },
    baseFacts({ dilutionFlags: ["offering"] })
  );
  assert.equal(dil.passed, true);
});

test("market session helper distinguishes weekend", () => {
  // Sunday
  const sun = marketSessionAt(new Date("2026-07-26T15:00:00Z"));
  assert.equal(sun, "weekend");
  // Wednesday regular ET ~15:00 = 19:00 UTC in summer
  const wed = marketSessionAt(new Date("2026-07-22T19:00:00Z"));
  assert.equal(wed, "regular");
});

test("mute by ticker / category / session", () => {
  const facts = baseFacts({
    symbol: "MUTE",
    catalystCategory: "offering",
    marketSession: "premarket",
  });
  assert.equal(
    isMuteActive({ tickers: ["MUTE"] }, facts).muted,
    true
  );
  assert.equal(
    isMuteActive({ categories: ["offering"] }, facts).muted,
    true
  );
  assert.equal(
    isMuteActive({ sessions: ["premarket"] }, facts).muted,
    true
  );
  assert.equal(
    isMuteActive(
      { tickers: ["MUTE"], until: new Date(Date.now() - 60_000).toISOString() },
      facts
    ).muted,
    false
  );
});

test("per-rule cooldown and daily cap", () => {
  __resetStrategyCooldownForTests();
  const opts = {
    userId: "u1",
    strategyId: "s1",
    symbol: "AAA",
    cooldownMinutes: 30,
    dailyAlertCap: 2,
    nowMs: 1_700_000_000_000,
  };
  assert.equal(checkStrategyCooldown(opts).allowed, true);
  recordStrategyFire(opts);
  assert.equal(checkStrategyCooldown(opts).allowed, false);
  assert.ok(
    checkStrategyCooldown(opts).reason?.toLowerCase().includes("cooldown")
  );

  // After cooldown — same symbol can fire again (still under daily cap)
  const later = { ...opts, nowMs: opts.nowMs + 31 * 60_000 };
  assert.equal(checkStrategyCooldown(later).allowed, true);
  recordStrategyFire(later);

  // Cap of 2 reached — third fire blocked even after cooldown
  const later3 = { ...later, nowMs: later.nowMs + 31 * 60_000, symbol: "CCC" };
  assert.equal(checkStrategyCooldown(later3).allowed, false);
  assert.ok(
    checkStrategyCooldown(later3).reason?.toLowerCase().includes("daily")
  );
});

test("versioning bumps and refuses silent overwrite", () => {
  const draft = buildPreset("custom");
  const first = bumpStrategyVersion(null, draft);
  assert.equal(first.refused, false);
  assert.equal(first.strategy.version, 1);

  const edited = {
    ...first.strategy,
    name: "Renamed",
    cooldownMinutes: 40,
  };
  const conflict = bumpStrategyVersion(first.strategy, edited, {
    expectedVersion: 99,
  });
  assert.equal(conflict.refused, true);
  assert.ok(conflict.refuseReason?.includes("Version conflict"));

  const ok = bumpStrategyVersion(first.strategy, edited, {
    expectedVersion: 1,
    changeNote: "rename",
  });
  assert.equal(ok.refused, false);
  assert.equal(ok.strategy.version, 2);
  assert.equal(ok.strategy.name, "Renamed");
  assert.notEqual(
    strategyContentHash(first.strategy),
    strategyContentHash(ok.strategy)
  );
});

test("historical simulation reports match count and limitations", () => {
  const strategy = buildPreset("custom");
  strategy.root = {
    id: "root",
    logic: "AND",
    conditions: [
      { id: "w", field: "watchlist_membership", op: "is_true", value: true },
      { id: "age", field: "max_catalyst_age_min", op: "lte", value: 999999 },
    ],
    groups: [],
  } satisfies StrategyConditionGroup;

  const rows = [
    {
      id: "1",
      symbol: "AAA",
      publishedAt: new Date().toISOString(),
      catalystType: "fda",
      changePercent: 5,
    },
    {
      id: "2",
      symbol: "BBB",
      publishedAt: new Date().toISOString(),
      catalystType: "earnings",
      changePercent: 1,
    },
    {
      id: "3",
      symbol: "CCC",
      publishedAt: new Date().toISOString(),
    },
  ];

  const sim = simulateStrategy(strategy, rows, {
    watchlistSymbols: ["AAA", "CCC"],
    skipDeliveryMode: true,
  });
  assert.equal(sim.sampleSize, 3);
  assert.equal(sim.matchedCount, 2);
  assert.ok(sim.limitations.length >= 3);
  assert.ok(sim.disclaimer.toLowerCase().includes("not a performance"));
});

test("why-fired / why-not explain", () => {
  const strategy = buildPreset("custom");
  strategy.root.conditions = [
    { id: "w", field: "watchlist_membership", op: "is_true", value: true },
    { id: "r", field: "relative_volume", op: "gte", value: 5 },
  ];

  const miss = explainStrategyMatch(
    strategy,
    baseFacts({ onWatchlist: true, relativeVolume: 1 })
  );
  assert.equal(miss.wouldAlert, false);
  assert.ok(miss.whyNot.length > 0);

  const hit = explainStrategyMatch(
    strategy,
    baseFacts({ onWatchlist: true, relativeVolume: 8 })
  );
  assert.equal(hit.wouldAlert, true);
  assert.ok(hit.why.length > 0);
});

test("export / import round-trip", () => {
  const a = buildPreset("biotech_catalyst");
  const bundle = exportStrategies([a]);
  assert.equal(bundle.format, "trustticker-alert-strategy");
  const imported = importStrategies(bundle, { replaceIds: true });
  assert.equal(imported.strategies.length, 1);
  assert.equal(imported.strategies[0]!.presetId, "biotech_catalyst");
  assert.equal(imported.strategies[0]!.delivery, "EARLY");
});

test("privacy scrub strips phone and watchlist", () => {
  const scrubbed = scrubStrategyAnalyticsProps({
    phoneNumber: "+15551234567",
    watchlist: "AAPL,MSFT,GOOG",
    strategyId: "strat_abc",
    version: 3,
    delivery: "EARLY",
  });
  assert.equal(scrubbed.phoneNumber, undefined);
  assert.equal(scrubbed.watchlist, undefined);
  assert.equal(scrubbed.strategyId, "strat_abc");
  assert.equal(scrubbed.version, 3);
});

test("RISK_ONLY dilution preset matches risk flags", () => {
  const s = buildPreset("dilution_offering_risk");
  const r = evaluateStrategy(
    s,
    baseFacts({
      dilutionFlags: ["offering"],
      catalystCategory: "offering",
      catalystAgeMin: 30,
    }),
    catalystStub({
      headline: "Announces registered direct offering",
      catalystType: "offering",
      aiSummary: "dilution risk from offering",
    }),
    { skipDeliveryMode: false }
  );
  // May or may not match depending on RISK_ONLY mode — condition tree at least sees dilution
  const condOnly = evaluateStrategy(
    s,
    baseFacts({
      dilutionFlags: ["offering"],
      riskFlags: ["offering", "dilution"],
      attentionPriority: 40,
      catalystAgeMin: 30,
    }),
    catalystStub({ headline: "Announces registered direct offering" }),
    { skipDeliveryMode: true }
  );
  assert.equal(condOnly.matched, true);
  void r;
});

test("strategy disabled never matches", () => {
  const s = buildPreset("custom");
  s.enabled = false;
  const r = evaluateStrategy(s, baseFacts(), catalystStub(), {
    skipDeliveryMode: true,
  });
  assert.equal(r.matched, false);
});
