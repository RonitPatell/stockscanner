/**
 * Monitor Audio Squawk — high-value gates, script format, quiet hours,
 * watchlist/strategy modes, cluster dedupe, interrupt, privacy.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SQUAWK_SETTINGS,
  assertNoSecretsInScript,
  attentionLeaderToMonitorSquawkInput,
  buildMonitorSquawkScript,
  enqueueSquawk,
  createEmptyQueue,
  isInQuietHours,
  monitorEventToUtterance,
  tapeItemToMonitorSquawkInput,
  type MonitorSquawkEventInput,
  type SquawkSettings,
} from "../src/lib/squawk/index.ts";
import type { MonitorTapeItem } from "../src/domain/monitor/event-tape/types.ts";
import {
  DASHBOARD_GUIDE_STEPS,
  PLATFORM_GUIDE_VERSION,
} from "../src/lib/platform-guide.ts";

function settings(over: Partial<SquawkSettings> = {}): SquawkSettings {
  return {
    ...DEFAULT_SQUAWK_SETTINGS,
    enabled: true,
    muted: false,
    quietHours: { enabled: false, startMin: 0, endMin: 0 },
    ...over,
  };
}

function tape(
  over: Partial<MonitorTapeItem> &
    Pick<MonitorTapeItem, "id" | "symbol" | "type">
): MonitorTapeItem {
  return {
    schemaVersion: "tt.monitor.event_tape.v1",
    ruleVersion: "monitor-event-tape-v1.0",
    atMs: Date.now(),
    label: over.type,
    explanation: "Structured explanation for inspection.",
    severity: "high",
    sourceType: "momentum",
    dataConfidence: "medium",
    fingerprint: `${over.symbol}|${over.type}|1`,
    clusterId: null,
    clusterMemberIds: [over.id],
    intelSection: "current-state",
    ...over,
  };
}

test("platform guide bumped for monitor squawk", () => {
  assert.ok(PLATFORM_GUIDE_VERSION >= 41);
  const step = DASHBOARD_GUIDE_STEPS.find((s) => s.id === "monitor-squawk");
  assert.ok(step?.body.toLowerCase().includes("high-value"));
  assert.ok(step?.body.toLowerCase().includes("quiet hours"));
});

test("monitor script format — max two sentences, structured fields", () => {
  const script = buildMonitorSquawkScript({
    symbol: "SGBX",
    eventPhrase: "Verified contract announcement",
    momentumState: "breaking",
    riskOrTradeability: "Spread is widening",
  });
  assert.ok(script.toLowerCase().includes("verified contract announcement"));
  assert.ok(script.toLowerCase().includes("breaking"));
  assert.ok(script.toLowerCase().includes("spread is widening"));
  // Logical sentence cap: ticker/event clause + optional warning clause.
  const sentences = script
    .replace(/^[A-Z](?:\s+[A-Z]){1,4}\.\s*/, "") // strip spelled ticker "S G B X. "
    .split(/(?<=\.)\s+/)
    .filter(Boolean);
  assert.ok(sentences.length <= 2, script);
  assert.ok(!/buy|sell|expected return/i.test(script));
});

test("halt + offering during halt compact script", () => {
  const script = buildMonitorSquawkScript({
    symbol: "RBNE",
    eventPhrase: "halted",
    riskOrTradeability: "Offering news released during the halt",
  });
  assert.match(script.toLowerCase(), /halted/);
  assert.match(script.toLowerCase(), /offering news released during the halt/);
  assert.ok(assertNoSecretsInScript(script));
});

test("never speaks raw article, secrets, or private notes", () => {
  const script = buildMonitorSquawkScript({
    symbol: "AAAA",
    eventPhrase: "Verified material catalyst",
    riskOrTradeability: "Call 555-123-4567 or email leak@x.com webhook https://discord.com/api/webhooks/abc",
  });
  assert.ok(!script.includes("555-123-4567"));
  assert.ok(!script.includes("leak@x.com"));
  assert.ok(!script.includes("webhooks"));
  assert.ok(assertNoSecretsInScript(script));
});

test("only high-value tape types become squawk inputs", () => {
  const burst = tapeItemToMonitorSquawkInput(
    tape({ id: "1", symbol: "AAAA", type: "TRADE_RATE_BURST" }),
    { onWatchlist: true, strategyMatch: true }
  );
  assert.equal(burst, null);

  const breaking = tapeItemToMonitorSquawkInput(
    tape({ id: "2", symbol: "AAAA", type: "MOMENTUM_BREAKING" }),
    { onWatchlist: true, strategyMatch: false, momentumState: "BREAKING" }
  );
  assert.ok(breaking);
  assert.equal(breaking!.type, "MOMENTUM_BREAKING");
});

test("dilution requires high severity; data degraded requires critical path", () => {
  const lowDil = tapeItemToMonitorSquawkInput(
    tape({
      id: "d1",
      symbol: "BBBB",
      type: "DILUTION_RISK",
      severity: "low",
    }),
    { onWatchlist: true, strategyMatch: true }
  );
  assert.equal(lowDil, null);

  const highDil = tapeItemToMonitorSquawkInput(
    tape({
      id: "d2",
      symbol: "BBBB",
      type: "DILUTION_RISK",
      severity: "high",
    }),
    { onWatchlist: true, strategyMatch: true }
  );
  assert.ok(highDil);

  const mildData = tapeItemToMonitorSquawkInput(
    tape({
      id: "q1",
      symbol: "AAAA",
      type: "DATA_DEGRADED",
      severity: "info",
      dataConfidence: "high",
    }),
    { onWatchlist: true, strategyMatch: true }
  );
  assert.equal(mildData, null);

  const critData = tapeItemToMonitorSquawkInput(
    tape({
      id: "q2",
      symbol: "AAAA",
      type: "DATA_DEGRADED",
      severity: "medium",
      dataConfidence: "degraded",
    }),
    { onWatchlist: true, strategyMatch: true }
  );
  assert.ok(critData);
});

test("respects quiet hours, watchlist-only, strategy-match", () => {
  const base: MonitorSquawkEventInput = {
    id: "e1",
    symbol: "AAAA",
    type: "VERIFIED_CATALYST",
    eventPhrase: "Verified material catalyst",
    onWatchlist: false,
    strategyMatch: false,
  };

  assert.equal(
    monitorEventToUtterance(base, {
      settings: settings({
        quietHours: { enabled: true, startMin: 0, endMin: 0 }, // equal → full-day mute
      }),
      nowMs: Date.UTC(2026, 0, 2, 17, 0, 0),
    }).skipReason,
    "quiet_hours"
  );

  // Confirm quiet helper with wrap hours
  assert.equal(
    isInQuietHours(
      { enabled: true, startMin: 22 * 60, endMin: 7 * 60 },
      Date.parse("2026-01-02T03:00:00-05:00")
    ),
    true
  );

  assert.equal(
    monitorEventToUtterance(base, {
      settings: settings({ watchlistOnly: true }),
    }).skipReason,
    "watchlist_only"
  );

  assert.equal(
    monitorEventToUtterance(
      { ...base, onWatchlist: true, strategyMatch: false },
      { settings: settings({ strategyMatchOnly: true }) }
    ).skipReason,
    "strategy_match_only"
  );

  const ok = monitorEventToUtterance(
    { ...base, onWatchlist: true, strategyMatch: true },
    { settings: settings({ watchlistOnly: true, strategyMatchOnly: true }) }
  );
  assert.ok(ok.utterance);
  assert.ok(ok.utterance!.script.length > 10);
});

test("clustered events dedupe; interrupt only for higher priority", () => {
  const a = monitorEventToUtterance(
    {
      id: "c1",
      symbol: "AAAA",
      type: "MOMENTUM_BREAKING",
      eventPhrase: "Momentum breaking",
      clusterId: "cl_AAAA_momentum",
      contentFingerprint: "fp1",
      onWatchlist: true,
      strategyMatch: true,
    },
    { settings: settings() }
  ).utterance!;
  const b = monitorEventToUtterance(
    {
      id: "c2",
      symbol: "AAAA",
      type: "MOMENTUM_BREAKING",
      eventPhrase: "Momentum breaking",
      clusterId: "cl_AAAA_momentum",
      contentFingerprint: "fp1",
      onWatchlist: true,
      strategyMatch: true,
    },
    { settings: settings() }
  ).utterance!;

  let q = createEmptyQueue();
  const r1 = enqueueSquawk(q, a);
  q = r1.state;
  const r2 = enqueueSquawk(q, b);
  assert.equal(r2.skipped, true);
  assert.equal(r2.reason, "duplicate");

  const halt = monitorEventToUtterance(
    {
      id: "h1",
      symbol: "FFFF",
      type: "HALTED",
      eventPhrase: "halted",
      clusterId: "cl_FFFF_halt",
      contentFingerprint: "halt1",
      onWatchlist: true,
      strategyMatch: true,
    },
    { settings: settings() }
  ).utterance!;

  const r3 = enqueueSquawk(r1.state, halt);
  assert.equal(r3.interrupt, true);
  assert.equal(r3.speakNow?.priority, "critical");
});

test("attention leader requires meaningful change", () => {
  assert.equal(
    attentionLeaderToMonitorSquawkInput({
      symbol: "AAAA",
      previousSymbol: "AAAA",
      onWatchlist: true,
      strategyMatch: true,
      meaningful: true,
    }),
    null
  );
  const next = attentionLeaderToMonitorSquawkInput({
    symbol: "BBBB",
    previousSymbol: "AAAA",
    momentumState: "BREAKING",
    onWatchlist: true,
    strategyMatch: true,
    meaningful: true,
  });
  assert.ok(next);
  const utt = monitorEventToUtterance(next!, { settings: settings() });
  assert.ok(utt.utterance?.script.toLowerCase().includes("attention leader"));
});
