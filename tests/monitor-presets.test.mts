/**
 * Monitor presets — catalog, validation limits, match explain, export/import,
 * silent-mutation guard, privacy scrub.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  STRATEGY_LIMITS,
  assertPresetNotSilentlyMutated,
  buildPreset,
  evaluateMonitorPreset,
  explainWhyTickerDidNotMatch,
  explainWhyTickerMatched,
  exportStrategies,
  factsFromMonitorSymbol,
  importStrategies,
  instantiateMonitorPreset,
  monitorPresetAnalyticsSafe,
  monitorPresetCatalog,
  replayMonitorPresetPreview,
  scrubStrategyAnalyticsProps,
  validateStrategy,
} from "../src/lib/alert-strategy/index.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

test("platform guide bumped for monitor presets", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 41);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-preset");
  assert.ok(step?.body.toLowerCase().includes("never changed silently"));
});

test("monitor catalog includes required presets", () => {
  const ids = monitorPresetCatalog().map((p) => p.id);
  for (const need of [
    "low_float_momentum",
    "biotech_catalyst",
    "large_cap_news",
    "downside_momentum",
    "halt_resumption",
    "dilution_offering_risk",
    "watchlist_only",
    "custom",
  ]) {
    assert.ok(ids.includes(need as (typeof ids)[number]), need);
  }
});

test("instantiateMonitorPreset validates and versions as v1 copy", () => {
  const built = instantiateMonitorPreset("watchlist_only");
  assert.equal(built.strategy.version, 1);
  assert.ok(built.summary.headline.toLowerCase().includes("watchlist"));
  assert.ok(built.contentHash.length > 8);
  assert.equal(validateStrategy(built.strategy).ok, true);
});

test("watchlist-only matches / explains miss", () => {
  const strategy = buildPreset("watchlist_only");
  const on = factsFromMonitorSymbol({
    symbol: "AAAA",
    onWatchlist: true,
    attentionPriority: 40,
    momentumIntensity: 50,
  });
  const off = factsFromMonitorSymbol({
    symbol: "ZZZZ",
    onWatchlist: false,
    attentionPriority: 90,
    momentumIntensity: 90,
  });
  assert.equal(evaluateMonitorPreset(strategy, on).matched, true);
  assert.ok(explainWhyTickerMatched(strategy, on).length > 0);
  assert.equal(evaluateMonitorPreset(strategy, off).matched, false);
  assert.ok(explainWhyTickerDidNotMatch(strategy, off).length > 0);
});

test("halt and resumption preset", () => {
  const strategy = buildPreset("halt_resumption");
  const halted = factsFromMonitorSymbol({
    symbol: "FFFF",
    onWatchlist: true,
    haltStatus: "halted",
    momentumState: "HALTED",
  });
  const resumed = factsFromMonitorSymbol({
    symbol: "FFFF",
    onWatchlist: true,
    haltStatus: "trading",
    resumptionFlag: true,
  });
  const quiet = factsFromMonitorSymbol({
    symbol: "AAAA",
    onWatchlist: true,
    haltStatus: "trading",
    resumptionFlag: false,
  });
  assert.equal(evaluateMonitorPreset(strategy, halted).matched, true);
  assert.equal(evaluateMonitorPreset(strategy, resumed).matched, true);
  assert.equal(evaluateMonitorPreset(strategy, quiet).matched, false);
});

test("downside momentum requires negative move", () => {
  const strategy = buildPreset("downside_momentum");
  const down = factsFromMonitorSymbol({
    symbol: "CCCC",
    onWatchlist: true,
    sessionChangePct: -5,
    momentumState: "FADING",
    momentumIntensity: 50,
    attentionPriority: 50,
    relativeVolume: 3,
    tradesPerSecond: 8,
    spreadBps: 40,
    tradeability: "ACCEPTABLE",
    marketSession: "regular",
  });
  const up = factsFromMonitorSymbol({
    symbol: "AAAA",
    onWatchlist: true,
    sessionChangePct: 8,
    momentumState: "BREAKING",
    momentumIntensity: 70,
    attentionPriority: 80,
    relativeVolume: 5,
    tradesPerSecond: 10,
    spreadBps: 30,
    tradeability: "ACCEPTABLE",
    marketSession: "regular",
  });
  assert.equal(evaluateMonitorPreset(strategy, down).matched, true);
  assert.equal(evaluateMonitorPreset(strategy, up).matched, false);
});

test("risk include/exclude contradiction is an error", () => {
  const s = buildPreset("custom");
  s.root.conditions = [
    { id: "a", field: "risk_flag", op: "in", value: ["offering"] },
    { id: "b", field: "risk_flag", op: "not_in", value: ["offering"] },
  ];
  const v = validateStrategy(s);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.code === "RISK_INCLUDE_EXCLUDE"));
});

test("export/import enforces payload and creates new identity", () => {
  const s = buildPreset("large_cap_news");
  const bundle = exportStrategies([s]);
  const imported = importStrategies(bundle, { replaceIds: true });
  assert.equal(imported.ok, true);
  assert.notEqual(imported.strategies[0]!.id, s.id);
  assert.equal(imported.strategies[0]!.version, 1);

  const huge = { format: "trustticker-alert-strategy", strategies: [s] };
  // Inflate past limit
  (huge as { pad?: string }).pad = "x".repeat(STRATEGY_LIMITS.maxPayloadBytes + 10);
  const blocked = importStrategies(huge);
  assert.equal(blocked.ok, false);
});

test("silent mutation guard", () => {
  const a = buildPreset("custom");
  a.id = "fixed";
  a.version = 2;
  const b = { ...a, name: "Renamed without bump" };
  const check = assertPresetNotSilentlyMutated(a, b);
  assert.equal(check.ok, false);
});

test("analytics scrub keeps private strategy contents out", () => {
  const s = buildPreset("watchlist_only");
  const safe = monitorPresetAnalyticsSafe(s);
  assert.ok(!("root" in safe));
  assert.ok(!("channels" in safe));
  const scrubbed = scrubStrategyAnalyticsProps({
    phone: "555",
    watchlistSymbols: "A,B,C,D,E,F,G",
    presetId: "watchlist_only",
  });
  assert.equal(scrubbed.phone, undefined);
  assert.equal(scrubbed.watchlistSymbols, undefined);
  assert.equal(scrubbed.presetId, "watchlist_only");
});

test("replay preview returns limitations", () => {
  const s = buildPreset("watchlist_only");
  const preview = replayMonitorPresetPreview(
    s,
    [
      {
        id: "1",
        symbol: "AAAA",
        publishedAt: new Date().toISOString(),
        factsExtras: { onWatchlist: true, attentionPriority: 40 },
      },
      {
        id: "2",
        symbol: "ZZZZ",
        publishedAt: new Date().toISOString(),
        factsExtras: { onWatchlist: false, attentionPriority: 90 },
      },
    ],
    { watchlistSymbols: ["AAAA"] }
  );
  assert.ok(preview.sampleSize >= 1);
  assert.ok(preview.limitations.some((l) => /inspection/i.test(l)));
});
