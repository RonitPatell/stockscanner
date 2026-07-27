import assert from "node:assert/strict";
import test from "node:test";
import {
  assessMatchConfidence,
  extractCashtagsAndExchangeTags,
  extractDuplicateCashtags,
  inferMatchMethod,
} from "../src/lib/coverage/match-assess.ts";
import {
  COVERAGE_REASONS,
  coverageTtlHours,
  isCoverageReason,
  isTemporaryReason,
} from "../src/lib/coverage/types.ts";
import { classifyAssetType, KNOWN_ETF_SYMBOLS } from "../src/lib/coverage/asset-type.ts";
import {
  detectRiskOnlyCatalyst,
  evaluateAlertMode,
  isStaleStory,
  previewAlertModes,
} from "../src/lib/alerts/modes.ts";
import type { CatalystItem } from "../src/types/index.ts";

function catalyst(
  partial: Partial<CatalystItem> &
    Pick<CatalystItem, "id" | "symbol" | "headline" | "source" | "publishedAt">
): CatalystItem {
  return {
    verifiedConfidence: 60,
    urgencyScore: 40,
    catalystType: "sec_filing",
    changePercent: 3,
    rVol: 2.5,
    price: 5,
    volume: 1_000_000,
    ...partial,
  };
}

test("coverage reasons include required enum values", () => {
  for (const r of [
    "USER_WATCHLIST",
    "CURATED_CORE",
    "ACTIVE_GAINER",
    "UNUSUAL_VOLUME",
    "RECENT_HALT",
    "FRESH_SEC_FILING",
    "FRESH_NEWS",
    "MANUAL",
  ]) {
    assert.equal(isCoverageReason(r), true);
  }
  assert.equal(COVERAGE_REASONS.length, 8);
  assert.equal(isTemporaryReason("FRESH_NEWS"), true);
  assert.equal(isTemporaryReason("CURATED_CORE"), false);
  assert.ok(coverageTtlHours("ACTIVE_GAINER") > 0);
});

test("ETF symbols classify as etf; random equity as equity", () => {
  assert.equal(classifyAssetType("SPY"), "etf");
  assert.equal(classifyAssetType("QQQ"), "etf");
  assert.ok(KNOWN_ETF_SYMBOLS.has("IWM"));
  assert.equal(classifyAssetType("AAPL", "Apple Inc"), "equity");
  assert.equal(classifyAssetType("XYZ", "Some Growth ETF Trust"), "etf");
});

test("small-cap cashtag extracts and scores as publishable", () => {
  const headline = "$GNUS announces FDA clearance for rare disease trial";
  const tags = extractCashtagsAndExchangeTags(headline);
  assert.ok(tags.includes("GNUS"));
  assert.equal(inferMatchMethod("GNUS", headline), "cashtag");
  const assessment = assessMatchConfidence({
    valid: true,
    confidence: 70,
    method: "cashtag",
    headline,
  });
  assert.equal(assessment.disposition, "publish");
});

test("ambiguous company name without ticker is quarantined", () => {
  const assessment = assessMatchConfidence({
    valid: true,
    confidence: 40,
    method: "headline_parse",
    headline: "Hope rises after championship expands",
    summary: "Lifestyle feature unrelated to equities.",
  });
  assert.equal(assessment.disposition, "quarantine");
});

test("duplicate cashtags quarantine instead of alerting", () => {
  const dups = extractDuplicateCashtags(
    "$AAPL and $MSFT lead tech while $NVDA also rips",
    undefined
  );
  assert.ok(dups.length >= 2);
  const assessment = assessMatchConfidence({
    valid: true,
    confidence: 70,
    method: "cashtag",
    headline: "$AAPL and $MSFT lead the session",
  });
  assert.equal(assessment.disposition, "quarantine");
  assert.equal(assessment.reason, "duplicate_cashtags");
});

test("ETF cashtag still matches with method cashtag", () => {
  const headline = "$SPY volume surges into the close";
  assert.ok(extractCashtagsAndExchangeTags(headline).includes("SPY"));
  assert.equal(inferMatchMethod("SPY", headline), "cashtag");
  assert.equal(classifyAssetType("SPY"), "etf");
});

test("stale story helper and RISK_ONLY stale trap", () => {
  const old = new Date(Date.now() - 10 * 3600_000).toISOString();
  assert.equal(isStaleStory(old, 6), true);
  assert.equal(isStaleStory(new Date().toISOString(), 6), false);

  const c = catalyst({
    id: "1",
    symbol: "ABCD",
    headline: "Company reiterates as previously announced ATM offering",
    source: "GlobeNewswire",
    publishedAt: old,
    catalystType: "offering",
  });
  const risk = detectRiskOnlyCatalyst(c);
  assert.equal(risk.isRisk, true);

  const early = evaluateAlertMode("EARLY", c);
  assert.equal(early.wouldFire, false);
});

test("EARLY fires without price; CONFIRMED needs price+volume", () => {
  const c = catalyst({
    id: "2",
    symbol: "SOFI",
    headline: "SOFI 8-K Filing: Material agreement",
    source: "SEC EDGAR",
    publishedAt: new Date().toISOString(),
    verifiedConfidence: 70,
    urgencyScore: 50,
    catalystType: "sec_filing",
    changePercent: 0.2,
    rVol: 0.5,
  });

  assert.equal(evaluateAlertMode("EARLY", c).wouldFire, true);
  assert.equal(evaluateAlertMode("CONFIRMED", c).wouldFire, false);
  assert.equal(
    evaluateAlertMode("CONFIRMED", { ...c, changePercent: 4, rVol: 3 }).wouldFire,
    true
  );
});

test("RISK_ONLY fires on dilution / offering language", () => {
  const c = catalyst({
    id: "3",
    symbol: "XYZ",
    headline: "XYZ announces $50M at-the-market equity offering",
    source: "GlobeNewswire",
    publishedAt: new Date().toISOString(),
    verifiedConfidence: 55,
  });
  assert.equal(evaluateAlertMode("RISK_ONLY", c).wouldFire, true);
});

test("preview returns all three modes", () => {
  const c = catalyst({
    id: "4",
    symbol: "NVDA",
    headline: "NVDA (NASDAQ: NVDA) reports earnings beat",
    source: "Business Wire",
    publishedAt: new Date().toISOString(),
    changePercent: 5,
    rVol: 3,
  });
  const modes = previewAlertModes(c);
  assert.equal(modes.length, 3);
  assert.deepEqual(
    modes.map((m) => m.mode),
    ["EARLY", "CONFIRMED", "RISK_ONLY"]
  );
});

test("exchange-tagged small-cap extracts cleanly", () => {
  const text = "Foo Biopharma (NASDAQ: ABCD) prices offering";
  assert.ok(extractCashtagsAndExchangeTags(text).includes("ABCD"));
  assert.equal(inferMatchMethod("ABCD", text), "exchange_tag");
});

test("cooldown condition is expressible as blocked log shape", () => {
  const blocked = [{ id: "cooldown", label: "Per-user cooldown active", passed: false }];
  assert.equal(blocked[0].id, "cooldown");
});
