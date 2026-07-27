/**
 * Reaction Stage Engine fixture tests — deterministic classification only.
 * Not a price-prediction or probability-of-profit model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  computeReactionStageEngine,
  recomputeReactionStage,
  applyHysteresis,
  atr14PctFromBars,
} from "../src/lib/reaction-stage/index.ts";
import type { ReactionStageCatalystInput } from "../src/lib/reaction-stage/types.ts";

const NOW = Date.parse("2026-07-27T14:30:00.000Z");

function base(over: Partial<ReactionStageCatalystInput> = {}): ReactionStageCatalystInput {
  return {
    catalystId: "c1",
    symbol: "TEST",
    headline: "TEST announces FDA clearance",
    source: "Globe Newswire",
    category: "fda",
    floatShares: 40_000_000,
    dollarVolume: 5_000_000,
    providerPublishedAt: new Date(NOW - 5 * 60_000).toISOString(),
    firstSeenAt: new Date(NOW - 4 * 60_000).toISOString(),
    classifiedAt: new Date(NOW - 3 * 60_000).toISOString(),
    ingestedAt: new Date(NOW - 4 * 60_000).toISOString(),
    timestampQuality: "EXACT_PROVIDER",
    priceAtPublication: 2.0,
    priceAtPublicationQuality: "ok",
    priceBeforePublication: 1.98,
    priceBeforePublicationQuality: "ok",
    priceAtIngestion: 2.05,
    priceAtIngestionQuality: "ok",
    nowMs: NOW,
    tape: {
      currentPrice: 2.1,
      dayChangePercent: 5,
      rVol: 2.2,
      dayHigh: 2.3,
      quoteAgeSec: 2,
    },
    ...over,
  };
}

test("news released before the move → EARLY", () => {
  const r = computeReactionStageEngine(
    base({
      providerPublishedAt: new Date(NOW - 3 * 60_000).toISOString(),
      priceBeforePublication: 2.0,
      priceAtPublication: 2.01,
      tape: {
        currentPrice: 2.08,
        dayChangePercent: 4,
        rVol: 1.8,
        quoteAgeSec: 1,
      },
    })
  );
  assert.equal(r.stage, "EARLY");
  assert.ok(r.engineVersion.startsWith("reaction-stage-"));
  assert.ok(r.rules.some((x) => x.id === "fresh_early_window" && x.passed));
  assert.ok(r.explanation.length > 10);
});

test("news published after a move → not EARLY (pre-move conflict)", () => {
  const r = computeReactionStageEngine(
    base({
      providerPublishedAt: new Date(NOW - 4 * 60_000).toISOString(),
      priceBeforePublication: 1.5,
      priceAtPublication: 2.0, // already +33% into print
      tape: {
        currentPrice: 2.1,
        dayChangePercent: 40,
        rVol: 5,
        quoteAgeSec: 1,
      },
    })
  );
  assert.notEqual(r.stage, "EARLY");
  assert.ok(r.rules.some((x) => x.id === "move_before_publication" && x.passed));
  assert.ok(
    r.conflictingEvidence.some((c) => c.id === "early_vs_premove") ||
      r.stage === "EXTENDED" ||
      r.stage === "ACTIVE"
  );
});

test("recycled press release → STALE", () => {
  const r = computeReactionStageEngine(
    base({
      headline: "Company reiterates as previously announced partnership",
      providerPublishedAt: new Date(NOW - 10 * 60_000).toISOString(),
    })
  );
  assert.equal(r.stage, "STALE");
  assert.ok(r.rules.some((x) => x.id === "stale_or_recycled" && x.passed));
});

test("wide-spread low-float stocks profile + rule", () => {
  const r = computeReactionStageEngine(
    base({
      floatShares: 3_000_000,
      dollarVolume: 200_000,
      tape: {
        currentPrice: 0.8,
        dayChangePercent: 6,
        rVol: 4,
        spreadBps: 220,
        quoteAgeSec: 3,
      },
    })
  );
  assert.ok(
    r.profileId === "low_float_wide_spread" ||
      r.rules.some((x) => x.id === "wide_spread_low_float" && x.passed)
  );
  assert.ok(r.rules.some((x) => x.id === "wide_spread_low_float"));
});

test("halts surface on timeline and rule when count known", () => {
  const r = computeReactionStageEngine(
    base({
      tape: {
        currentPrice: 2.1,
        dayChangePercent: 5,
        rVol: 2,
        haltCount: 2,
        haltWindows: [[Math.floor(NOW / 1000) - 600, Math.floor(NOW / 1000) - 540]],
        quoteAgeSec: 1,
      },
    })
  );
  assert.ok(r.rules.some((x) => x.id === "halt_active" && x.passed));
  assert.ok(r.timeline.some((e) => e.kind === "halt"));
});

test("after-hours announcements use afterhours session profile", () => {
  const ah = Date.parse("2026-07-27T21:00:00.000Z"); // 17:00 ET summer
  const r = computeReactionStageEngine(
    base({
      nowMs: ah,
      providerPublishedAt: new Date(ah - 8 * 60_000).toISOString(),
      firstSeenAt: new Date(ah - 7 * 60_000).toISOString(),
      priceAtPublication: 3,
      priceBeforePublication: 2.99,
      priceAtIngestion: 3.02,
      tape: {
        currentPrice: 3.05,
        dayChangePercent: 2,
        rVol: 1.6,
        quoteAgeSec: 2,
      },
    })
  );
  assert.equal(r.metrics.marketSession, "afterhours");
  assert.ok(r.profileId === "afterhours" || r.stage === "EARLY" || r.stage === "ACTIVE");
});

test("unreliable provider timestamps → UNKNOWN", () => {
  const r = computeReactionStageEngine(
    base({
      timestampQuality: "MISSING",
      providerPublishedAt: new Date(NOW).toISOString(),
    })
  );
  assert.equal(r.stage, "UNKNOWN");
  assert.ok(r.explanation.includes("UNKNOWN"));
});

test("never silently invent publication price from distant candle", () => {
  const pub = Math.floor(NOW / 1000) - 3600;
  const r = computeReactionStageEngine(
    base({
      priceAtPublication: undefined,
      priceBeforePublication: undefined,
      priceAtPublicationQuality: undefined,
      priceBeforePublicationQuality: undefined,
      providerPublishedAt: new Date(pub * 1000).toISOString(),
      tape: {
        currentPrice: 2.1,
        dayChangePercent: 5,
        rVol: 2,
        quoteAgeSec: 1,
        // Candle 20 minutes after publish — beyond max substitute lag
        bars1m: [{ t: pub + 1200, o: 2, h: 2.1, l: 1.9, c: 2.05, v: 1000 }],
      },
    })
  );
  assert.equal(r.metrics.priceAtPublication.availability, "unavailable");
  assert.ok(
    (r.metrics.priceAtPublication.note ?? "").includes("lag") ||
      (r.metrics.priceAtPublication.note ?? "").includes("unavailable") ||
      (r.metrics.priceAtPublication.note ?? "").includes("MISSING") ||
      (r.metrics.priceAtPublication.note ?? "").includes("exceeds") ||
      (r.metrics.priceAtPublication.note ?? "").includes("publication")
  );
  assert.equal(r.metrics.marks.priceAtPublication.substituted, false);
});

test("substituted candle is marked, not silent", () => {
  const pub = Math.floor(NOW / 1000) - 60;
  const r = computeReactionStageEngine(
    base({
      priceAtPublication: undefined,
      priceBeforePublication: undefined,
      providerPublishedAt: new Date(pub * 1000).toISOString(),
      tape: {
        currentPrice: 2.2,
        quoteAgeSec: 1,
        bars1m: [
          { t: pub - 60, o: 2, h: 2.05, l: 1.95, c: 2.0, v: 500 },
          { t: pub + 45, o: 2.0, h: 2.1, l: 1.99, c: 2.08, v: 800 },
        ],
      },
    })
  );
  // May be ok (exact) or substituted — never invent without mark when substituted
  if (r.metrics.marks.priceAtPublication.substituted) {
    assert.ok(r.metrics.priceAtPublication.availability === "estimated");
  }
});

test("hysteresis prevents EARLY↔ACTIVE flap", () => {
  const held = applyHysteresis({
    candidate: "EARLY",
    previous: "ACTIVE",
    previousAtMs: NOW - 5_000,
    nowMs: NOW,
    hysteresisMs: 45_000,
  });
  assert.equal(held.stage, "ACTIVE");
  assert.equal(held.flappedSuppressed, true);

  const first = computeReactionStageEngine(
    base({
      previousStage: "ACTIVE",
      previousStageAtMs: NOW - 5_000,
      providerPublishedAt: new Date(NOW - 3 * 60_000).toISOString(),
      priceBeforePublication: 2.0,
      priceAtPublication: 2.01,
      tape: { currentPrice: 2.05, rVol: 1.5, quoteAgeSec: 1, dayChangePercent: 2 },
    })
  );
  assert.equal(first.flappedSuppressed, true);
  assert.equal(first.stage, "ACTIVE");

  const later = recomputeReactionStage(
    base({
      providerPublishedAt: new Date(NOW - 3 * 60_000).toISOString(),
      priceBeforePublication: 2.0,
      priceAtPublication: 2.01,
      tape: { currentPrice: 2.05, rVol: 1.5, quoteAgeSec: 1, dayChangePercent: 2 },
      nowMs: NOW + 60_000,
    }),
    { ...first, computedAt: new Date(NOW - 5_000).toISOString() }
  );
  // After dwell, may move to EARLY
  assert.ok(["EARLY", "ACTIVE"].includes(later.stage));
});

test("timeline includes publication, ingestion, delivery", () => {
  const r = computeReactionStageEngine(
    base({
      userDeliveredAt: new Date(NOW - 2 * 60_000).toISOString(),
      alertEvents: [{ at: new Date(NOW - 90_000).toISOString(), label: "Watchlist alert" }],
    })
  );
  const kinds = new Set(r.timeline.map((e) => e.kind));
  assert.ok(kinds.has("publication"));
  assert.ok(kinds.has("first_ingestion"));
  assert.ok(kinds.has("user_delivered"));
  assert.ok(kinds.has("alert"));
});

test("ATR from bars when enough history", () => {
  const bars = [];
  let p = 10;
  for (let i = 0; i < 20; i++) {
    p += (i % 2 === 0 ? 0.1 : -0.05);
    bars.push({ h: p + 0.2, l: p - 0.2, c: p });
  }
  const atr = atr14PctFromBars(bars);
  assert.ok(atr != null && atr > 0);
});

test("persistable rule contributions and version always present", () => {
  const r = computeReactionStageEngine(base());
  assert.ok(r.rules.length >= 5);
  assert.ok(r.rules.every((x) => x.id && x.label && typeof x.passed === "boolean"));
  assert.equal(r.engineVersion, "reaction-stage-v1.0");
});
