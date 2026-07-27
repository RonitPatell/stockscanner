/**
 * Trader feedback — privacy, deletion, export, analytics redaction, autopsy, monthly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createDecisionRecord,
  parseDecisionRecord,
  deleteAllLocalDecisions,
  listLocalDecisions,
  saveLocalDecision,
  exportFeedbackBundle,
  importFeedbackBundle,
  decisionsToCsv,
  decisionsFromCsv,
  scrubFeedbackAnalyticsProps,
  feedbackAnalyticsSafeSummary,
  buildCatalystAutopsy,
  buildMonthlyFactualSummary,
  deriveUserExcursion,
  setSyncOptIn,
  isSyncOptedIn,
  __setRecordsForTests,
  TRADER_FEEDBACK_DISCLAIMER,
} from "../src/lib/trader-feedback/index.ts";

// Minimal localStorage polyfill for node tests
function installLocalStorage() {
  const map = new Map<string, string>();
  // @ts-expect-error test shim
  globalThis.localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  // @ts-expect-error test shim
  globalThis.window = {
    dispatchEvent: () => true,
    localStorage: globalThis.localStorage,
  };
}

installLocalStorage();

test("create / export / import / delete all local records", () => {
  deleteAllLocalDecisions();
  const r = createDecisionRecord({
    action: "skipped",
    symbol: "ABCD",
    catalystId: "cat1",
    reason: "dilution",
    headline: "Offering announced",
    context: {
      catalystAgeMin: 12,
      reactionStage: "EARLY",
      tradeability: "THIN",
      risksVisible: ["dilution"],
      catalystType: "offering",
      followedOwnRules: true,
    },
  });
  saveLocalDecision(r);
  assert.equal(listLocalDecisions().length, 1);

  const bundle = exportFeedbackBundle();
  assert.equal(bundle.format, "trustticker-trader-feedback");
  assert.equal(bundle.records.length, 1);
  assert.ok(bundle.disclaimer.includes("does not execute orders"));

  deleteAllLocalDecisions();
  assert.equal(listLocalDecisions().length, 0);

  const imported = importFeedbackBundle(bundle);
  assert.equal(imported.imported, 1);
  assert.equal(listLocalDecisions().length, 1);

  const { deleted } = deleteAllLocalDecisions();
  assert.equal(deleted, 1);
  assert.equal(listLocalDecisions().length, 0);
});

test("CSV export/import round-trip without brokerage", () => {
  deleteAllLocalDecisions();
  const r = createDecisionRecord({
    action: "entered",
    symbol: "NVDA",
    entryPrice: 100,
    exitPrice: 105,
    positionSize: 1000,
    side: "long",
    reason: "catalyst_quality",
    context: {
      reactionStage: "ACTIVE",
      catalystType: "fda",
      catalystAgeMin: 5,
    },
  });
  saveLocalDecision(r);
  const csv = decisionsToCsv(listLocalDecisions());
  assert.ok(csv.includes("action,reason,symbol"));
  assert.ok(csv.includes("entered"));

  deleteAllLocalDecisions();
  const parsed = decisionsFromCsv(csv);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0]!.symbol, "NVDA");
  assert.equal(parsed.records[0]!.action, "entered");
});

test("analytics redaction strips phone email watchlist notes", () => {
  const scrubbed = scrubFeedbackAnalyticsProps({
    phoneNumber: "+15551234567",
    email: "a@b.com",
    watchlist: "AAPL,MSFT,GOOG,AMZN,META,NVDA",
    reasonNote: "call my broker",
    action: "skipped",
    reason: "dilution",
  });
  assert.equal(scrubbed.phoneNumber, undefined);
  assert.equal(scrubbed.email, undefined);
  assert.equal(scrubbed.watchlist, undefined);
  assert.equal(scrubbed.reasonNote, undefined);
  assert.equal(scrubbed.action, "skipped");

  const safe = feedbackAnalyticsSafeSummary({
    action: "entered",
    reason: "spread",
    syncOptIn: false,
  });
  assert.equal(safe.action, "entered");
  assert.equal(safe.syncOptIn, false);
});

test("sync opt-in defaults false", () => {
  localStorage.removeItem("tt-trader-feedback-sync-opt-in");
  assert.equal(isSyncOptedIn(), false);
  setSyncOptIn(true);
  assert.equal(isSyncOptedIn(), true);
  setSyncOptIn(false);
  assert.equal(isSyncOptedIn(), false);
});

test("autopsy shows decision-time fields and similar past decisions", () => {
  const past = createDecisionRecord({
    action: "skipped",
    symbol: "XYZ",
    reason: "dilution",
    decidedAt: "2026-01-01T15:00:00Z",
    context: { reactionStage: "EARLY", catalystType: "offering" },
  });
  const current = createDecisionRecord({
    action: "skipped",
    symbol: "XYZ",
    reason: "dilution",
    decidedAt: "2026-06-01T15:00:00Z",
    context: {
      catalystAgeMin: 8,
      reactionStage: "EXTENDED",
      tradeability: "THIN",
      risksVisible: ["dilution", "wide spread"],
      moveCompletedBeforeEntryPct: 12,
      followedOwnRules: false,
      missingInformation: ["post_decision_excursion"],
    },
  });
  const autopsy = buildCatalystAutopsy(current, [past, current]);
  assert.equal(autopsy.catalystAgeMin, 8);
  assert.equal(autopsy.reactionStageAtDecision, "EXTENDED");
  assert.equal(autopsy.tradeabilityAtDecision, "THIN");
  assert.ok(autopsy.risksVisibleAtDecision.includes("dilution"));
  assert.equal(autopsy.moveCompletedBeforeEntryPct, 12);
  assert.equal(autopsy.followedOwnAlertRules, false);
  assert.ok(autopsy.similarPastDecisions.some((s) => s.id === past.id));
  assert.ok(autopsy.disclaimer.includes("does not execute"));
  assert.ok(!/made you money/i.test(autopsy.disclaimer));
});

test("monthly summary factual + labelled user PnL only from records", () => {
  const records = [
    createDecisionRecord({
      action: "entered",
      symbol: "AAA",
      decidedAt: "2026-03-10T14:00:00Z",
      entryPrice: 10,
      exitPrice: 11,
      positionSize: 1000,
      side: "long",
      context: {
        reactionStage: "EXTENDED",
        catalystType: "fda",
        catalystAgeMin: 20,
      },
    }),
    createDecisionRecord({
      action: "skipped",
      symbol: "BBB",
      reason: "dilution",
      decidedAt: "2026-03-12T14:00:00Z",
      context: { reactionStage: "EARLY", catalystType: "offering", catalystAgeMin: 5 },
    }),
    createDecisionRecord({
      action: "watched",
      symbol: "CCC",
      decidedAt: "2026-03-15T14:00:00Z",
      context: { reactionStage: "ACTIVE", catalystType: "earnings", catalystAgeMin: 15 },
    }),
  ];
  __setRecordsForTests(records);
  const summary = buildMonthlyFactualSummary(records, "2026-03");
  assert.equal(summary.decisionsRecorded, 3);
  assert.ok(summary.averageCatalystAgeMin != null);
  assert.equal(summary.pctEnteredWhileExtended, 1);
  assert.equal(summary.pctSkippedForDilution, 1);
  const fda = summary.outcomesByCatalystType.find((x) => x.type === "fda");
  assert.ok(fda);
  assert.equal(fda!.byAction.entered, 1);
  const extended = summary.outcomesByReactionStage.find(
    (x) => x.stage === "EXTENDED"
  );
  assert.ok(extended);
  assert.equal(extended!.byAction.entered, 1);
  assert.ok(summary.userRecordedNotionalPnl);
  assert.ok(
    summary.userRecordedNotionalPnl!.label.toLowerCase().includes("your entered")
  );
  assert.ok(!/trustticker made you money/i.test(summary.disclaimer));
  assert.ok(TRADER_FEEDBACK_DISCLAIMER.length > 40);
});

test("user excursion derived from entry/exit only", () => {
  const r = createDecisionRecord({
    action: "entered",
    symbol: "X",
    entryPrice: 50,
    exitPrice: 55,
    side: "long",
    positionSize: 1000,
  });
  const d = deriveUserExcursion(r);
  assert.equal(d.mfePct, 10);
  assert.equal(d.maePct, 0);
});

test("parse rejects invalid action", () => {
  assert.equal(parseDecisionRecord({ action: "buy", symbol: "AAPL" }), null);
  assert.ok(
    parseDecisionRecord({
      action: "ignored",
      symbol: "aapl",
      decidedAt: new Date().toISOString(),
    })
  );
});
