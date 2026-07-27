import assert from "node:assert/strict";
import test from "node:test";
import { buildJudgmentV2, judgmentV2ToTradeJudgment } from "../src/lib/judgment/build-v2.ts";
import { JUDGMENT_V2_VERSION } from "../src/lib/judgment/types.ts";
import type { CatalystItem } from "../src/types/index.ts";

function base(
  partial: Partial<CatalystItem> &
    Pick<CatalystItem, "id" | "symbol" | "headline" | "source" | "publishedAt">
): CatalystItem {
  return {
    verifiedConfidence: 70,
    matchMethod: "cashtag",
    sourceTier: "wire",
    urgencyScore: 55,
    sentimentScore: 40,
    catalystType: "fda",
    changePercent: 3,
    rVol: 2.5,
    floatShares: 40_000_000,
    price: 8,
    sourceUrl: "https://www.sec.gov/example",
    ...partial,
  };
}

test("judgment version is stamped on every classification", () => {
  const j = buildJudgmentV2(
    base({
      id: "1",
      symbol: "ABCD",
      headline: "$ABCD announces FDA clearance",
      source: "GlobeNewswire",
      publishedAt: new Date().toISOString(),
    })
  );
  assert.equal(j.version, JUDGMENT_V2_VERSION);
  assert.ok(j.classifiedAt);
  assert.ok(j.disclaimer.toLowerCase().includes("not financial advice"));
  assert.ok(j.disclaimer.toLowerCase().includes("not a personalized"));
});

test("positive news with dilution is MIXED and SKIP", () => {
  const j = buildJudgmentV2(
    base({
      id: "2",
      symbol: "XYZ",
      headline: "XYZ soars on partnership news, announces $40M public offering",
      source: "Business Wire",
      publishedAt: new Date().toISOString(),
      catalystType: "partnership",
      sentimentScore: 55,
    })
  );
  assert.equal(j.directionalImplication, "MIXED");
  assert.ok(j.riskFlags.some((r) => r.id === "dilution" || r.id === "positive_with_dilution"));
  assert.equal(j.grade, "skip");
  assert.ok(j.scoreContributions.some((s) => s.id === "dilution"));
});

test("misleading promotional announcement is weak / not material leaning", () => {
  const j = buildJudgmentV2(
    base({
      id: "3",
      symbol: "HYPE",
      headline: "BREAKING NEWS!!! HYPE to the moon — guaranteed 10x potential!!!",
      source: "Unknown Blog",
      sourceTier: "other",
      publishedAt: new Date().toISOString(),
      catalystType: "other",
      sentimentScore: 80,
      verifiedConfidence: 35,
      urgencyScore: 80,
    })
  );
  assert.ok(
    j.catalystStrength === "WEAK" || j.catalystStrength === "NOT_MATERIAL"
  );
  assert.ok(j.riskFlags.some((r) => r.id === "promotional"));
  assert.ok(j.scoreContributions.some((s) => s.id === "promo"));
});

test("scheduled event gets SCHEDULED timing and not GO", () => {
  const j = buildJudgmentV2(
    base({
      id: "4",
      symbol: "AAPL",
      headline: "AAPL scheduled to report earnings on Thursday",
      source: "PR Newswire",
      publishedAt: new Date().toISOString(),
      catalystType: "earnings",
      sentimentScore: 20,
      urgencyScore: 40,
      changePercent: 0.5,
    })
  );
  assert.equal(j.timing, "SCHEDULED");
  assert.notEqual(j.grade, "go");
});

test("stale article is marked STALE", () => {
  const old = new Date(Date.now() - 12 * 3600_000).toISOString();
  const j = buildJudgmentV2(
    base({
      id: "5",
      symbol: "MSFT",
      headline: "MSFT expands cloud partnership",
      source: "GlobeNewswire",
      publishedAt: old,
      catalystType: "partnership",
    })
  );
  assert.equal(j.timing, "STALE");
  assert.ok(j.riskFlags.some((r) => r.id === "stale"));
});

test("mixed earnings language yields MIXED direction", () => {
  const j = buildJudgmentV2(
    base({
      id: "6",
      symbol: "SHOP",
      headline: "SHOP beats on EPS but misses revenue, mixed results",
      source: "Business Wire",
      publishedAt: new Date().toISOString(),
      catalystType: "earnings",
      sentimentScore: 5,
    })
  );
  assert.equal(j.directionalImplication, "MIXED");
});

test("ambiguous ticker extraction lowers confidence and flags risk", () => {
  const j = buildJudgmentV2(
    base({
      id: "7",
      symbol: "HOPE",
      headline: "Hope rises after championship expands across the region",
      source: "Lifestyle Wire",
      sourceTier: "other",
      publishedAt: new Date().toISOString(),
      catalystType: "other",
      verifiedConfidence: 22,
      matchMethod: "headline_parse",
      sentimentScore: 10,
      urgencyScore: 20,
    })
  );
  assert.ok(j.missingOrUncertain.some((m) => /ticker match/i.test(m)));
  assert.ok(j.riskFlags.some((r) => r.id === "ambiguous_ticker"));
  assert.equal(j.confidence === "LOW" || j.grade === "skip" || j.grade === "watch", true);
});

test("V2 projects to legacy TradeJudgment with version field", () => {
  const j = buildJudgmentV2(
    base({
      id: "8",
      symbol: "NVDA",
      headline: "NVDA (NASDAQ: NVDA) announces major contract",
      source: "Business Wire",
      publishedAt: new Date().toISOString(),
      catalystType: "contract",
      sentimentScore: 50,
      changePercent: 2,
      rVol: 2.2,
      floatShares: 2_400_000_000,
    })
  );
  const legacy = judgmentV2ToTradeJudgment(j);
  assert.equal(legacy.judgmentVersion, JUDGMENT_V2_VERSION);
  assert.equal(legacy.grade, j.grade);
  assert.ok(legacy.judgmentV2);
  assert.ok(["go", "watch", "skip"].includes(legacy.grade));
});

test("change log records grade changes", () => {
  const first = buildJudgmentV2(
    base({
      id: "9",
      symbol: "AAA",
      headline: "AAA announces FDA approval",
      source: "GlobeNewswire",
      publishedAt: new Date().toISOString(),
      catalystType: "fda",
      changePercent: 2,
      rVol: 3,
    })
  );
  const second = buildJudgmentV2(
    base({
      id: "9",
      symbol: "AAA",
      headline: "AAA announces $50M public offering after FDA approval",
      source: "GlobeNewswire",
      publishedAt: new Date().toISOString(),
      catalystType: "offering",
      changePercent: 15,
    }),
    { previous: first, changeReason: "Dilution language appeared" }
  );
  assert.ok(second.changeLog.length >= 1);
  assert.equal(second.changeLog[second.changeLog.length - 1].reason, "Dilution language appeared");
});

test("source URL preserved as verified fact when present", () => {
  const j = buildJudgmentV2(
    base({
      id: "10",
      symbol: "SECX",
      headline: "8-K Filing: Material agreement",
      source: "SEC EDGAR",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/0001.htm",
      publishedAt: new Date().toISOString(),
      catalystType: "sec_filing",
    })
  );
  assert.ok(j.verifiedFacts.some((f) => /evidence link/i.test(f)));
  assert.equal(j.sourceUrl?.includes("sec.gov"), true);
});
