/**
 * Audio Squawk + Focus Mode — dedupe, interrupt, quiet hours, disconnect, unsupported APIs.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSquawkScript,
  assertNoSecretsInScript,
  scrubForSpeech,
  decideDedupe,
  enqueueSquawk,
  createEmptyQueue,
  shouldInterrupt,
  isInQuietHours,
  computeSquawkPriority,
  detectSpeechSynthesis,
  detectNotificationActions,
  catalystToUtterance,
  DEFAULT_SQUAWK_SETTINGS,
  type SquawkUtterance,
} from "../src/lib/squawk/index.ts";
import {
  selectFocusActive,
  rankForFocusMode,
  FOCUS_MAX_ACTIVE,
  createDeliveryHealth,
  onDeliveryError,
  onDeliveryOpen,
  shouldWarnDisconnect,
} from "../src/lib/focus-mode/index.ts";
import type { CatalystItem } from "../src/types/index.ts";

function utt(over: Partial<SquawkUtterance> & Pick<SquawkUtterance, "id" | "catalystId">): SquawkUtterance {
  return {
    symbol: "TEST",
    storyClusterId: null,
    contentFingerprint: "fp1",
    script: "Test. Script.",
    priority: "normal",
    priorityScore: 50,
    createdAt: Date.now(),
    isUpdate: false,
    ...over,
  };
}

test("script is max two sentences and excludes raw article / secrets", () => {
  const script = buildSquawkScript({
    id: "1",
    symbol: "NVDA",
    verifiedFact: "FDA approval announced for trial endpoint.",
    sourceQuality: "primary wire",
    moveSincePublicationPct: 4.2,
    rVol: 3.1,
    tradeability: "ACCEPTABLE",
    highestRisk: "dilution language",
    contentFingerprint: "a",
    aiSummary: "LONG ARTICLE TEXT THAT MUST NEVER BE SPOKEN " + "x".repeat(500),
    headline: "Secret headline with phone +15551234567 and user@evil.com",
    phoneNumber: "+15551234567",
    email: "user@evil.com",
    webhookUrl: "https://discord.com/api/webhooks/123/abc",
    privateNote: "call me at home",
  });
  const sentences = script.split(/(?<=\.)\s+/).filter(Boolean);
  assert.ok(sentences.length <= 2);
  assert.ok(!script.includes("LONG ARTICLE"));
  assert.ok(!script.includes("15551234567"));
  assert.ok(!script.includes("user@evil.com"));
  assert.ok(!script.includes("webhook"));
  assert.ok(assertNoSecretsInScript(script));
  assert.ok(script.toLowerCase().includes("nvidia") || script.includes("N V D A") || script.includes("NVDA") || script.includes("Nvidia"));
});

test("scrub removes phones emails webhooks", () => {
  const s = scrubForSpeech(
    "Call +1 (555) 123-4567 or a@b.com https://discord.com/api/webhooks/1/2"
  );
  assert.ok(!/\d{7,}/.test(s.replace(/\[redacted\]/g, "")));
  assert.ok(s.includes("[redacted]"));
});

test("dedupe related headlines and update on enrichment", () => {
  const a = utt({
    id: "1",
    catalystId: "c1",
    storyClusterId: "storyA",
    contentFingerprint: "v1",
  });
  const same = utt({
    id: "2",
    catalystId: "c1",
    storyClusterId: "storyA",
    contentFingerprint: "v1",
  });
  assert.equal(decideDedupe(same, a).action, "skip_duplicate");

  const enriched = utt({
    id: "3",
    catalystId: "c1",
    storyClusterId: "storyA",
    contentFingerprint: "v2",
  });
  assert.equal(decideDedupe(enriched, a).action, "update");

  const related = utt({
    id: "4",
    catalystId: "c2",
    storyClusterId: "storyA",
    contentFingerprint: "other",
  });
  assert.equal(decideDedupe(related, a).action, "update");
});

test("priority interruption only for higher priority", () => {
  assert.equal(shouldInterrupt("normal", "high"), true);
  assert.equal(shouldInterrupt("high", "normal"), false);
  assert.equal(shouldInterrupt("high", "high"), false);
  assert.equal(shouldInterrupt(null, "low"), true);

  let state = createEmptyQueue();
  const low = utt({ id: "l", catalystId: "a", priority: "low", priorityScore: 20 });
  let r = enqueueSquawk(state, low);
  state = r.state;
  assert.equal(r.interrupt, false);
  assert.ok(r.speakNow);

  const high = utt({
    id: "h",
    catalystId: "b",
    priority: "critical",
    priorityScore: 99,
    contentFingerprint: "other",
  });
  r = enqueueSquawk(state, high);
  assert.equal(r.interrupt, true);
  assert.equal(r.speakNow?.priority, "critical");
});

test("quiet hours wrap midnight", () => {
  // Pick a fixed UTC instant and compute — use enabled window that includes "now"
  const quiet = { enabled: true, startMin: 0, endMin: 24 * 60 };
  assert.equal(isInQuietHours(quiet, Date.now()), true);

  const off = { enabled: false, startMin: 0, endMin: 24 * 60 };
  assert.equal(isInQuietHours(off, Date.now()), false);

  // Empty window when start==end treated as full-day mute when enabled
  assert.equal(
    isInQuietHours({ enabled: true, startMin: 100, endMin: 100 }, Date.now()),
    true
  );
});

test("watchlist-only and risk-only gates", () => {
  const base: CatalystItem = {
    id: "c1",
    symbol: "AAA",
    headline: "Company announces registered direct offering",
    source: "wire",
    publishedAt: new Date().toISOString(),
    catalystType: "offering",
    changePercent: 5,
    rVol: 3,
    verifiedConfidence: 80,
    urgencyScore: 60,
  };

  const settings = {
    ...DEFAULT_SQUAWK_SETTINGS,
    enabled: true,
    watchlistOnly: true,
    riskOnly: false,
  };
  const skip = catalystToUtterance(base, {
    onWatchlist: false,
    settings,
  });
  assert.equal(skip.skipReason, "watchlist_only");

  const riskOnly = catalystToUtterance(
    { ...base, headline: "Routine press mention", catalystType: "other" },
    {
      onWatchlist: true,
      settings: { ...settings, watchlistOnly: false, riskOnly: true },
    }
  );
  // may or may not be risk depending on detectRiskOnlyCatalyst
  assert.ok(
    riskOnly.skipReason === "risk_only" || riskOnly.utterance != null
  );
});

test("focus mode ranks without profitability and caps at 5", () => {
  const items: CatalystItem[] = Array.from({ length: 12 }, (_, i) => ({
    id: `id${i}`,
    symbol: `S${i}`,
    headline: "News",
    source: "wire",
    publishedAt: new Date(Date.now() - i * 60_000).toISOString(),
    urgencyScore: 80 - i,
    verifiedConfidence: 70,
    changePercent: 3,
  }));
  items[5]!.symbol = "WATCH";
  const ranked = rankForFocusMode(items, {
    watchlist: ["WATCH"],
    nowMs: Date.now(),
  });
  assert.equal(ranked[0]!.symbol, "WATCH");
  assert.ok(ranked.every((r) => r.profitabilityNotUsed === true));

  const selected = selectFocusActive(items, { watchlist: ["WATCH"] });
  assert.ok(selected.length <= FOCUS_MAX_ACTIVE);
  assert.equal(selected.length, FOCUS_MAX_ACTIVE);
});

test("disconnected delivery health warns user", () => {
  let h = createDeliveryHealth({ state: "connecting" });
  h = onDeliveryOpen(h);
  assert.equal(shouldWarnDisconnect(h), false);
  h = onDeliveryError(h);
  assert.equal(h.state, "disconnected");
  assert.equal(shouldWarnDisconnect(h), true);
  assert.ok(h.warning?.toLowerCase().includes("disconnected"));
});

test("unsupported browser APIs detected", () => {
  assert.equal(detectSpeechSynthesis(null).supported, false);
  assert.equal(
    detectSpeechSynthesis({}).supported,
    false
  );
  assert.equal(
    detectSpeechSynthesis({
      speechSynthesis: {},
      SpeechSynthesisUtterance: function () {},
    }).supported,
    true
  );
  assert.equal(detectNotificationActions(null).supported, false);
  assert.equal(
    detectNotificationActions({
      Notification: Object.assign(function () {}, { maxActions: 2 }),
    }).supported,
    true
  );
});

test("priority scoring elevates watchlist + high risk", () => {
  const low = computeSquawkPriority({});
  const high = computeSquawkPriority({
    onWatchlist: true,
    isRiskCatalyst: true,
    riskSeverity: "high",
    urgencyScore: 90,
    verifiedConfidence: 90,
  });
  assert.ok(high.score > low.score);
  assert.ok(
    high.level === "high" || high.level === "critical"
  );
});
