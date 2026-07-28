/**
 * Catalyst Feed V3 — presentation projection, Focus sort, SSE merge, shortcuts.
 * Does not alter classification engines.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALYST_FEED_V3_VERSION,
  DEFAULT_FEED_V3_PREFS,
  FEED_V3_COLORS,
  FEED_V3_ROW_HEIGHT_PX,
  FEED_V3_SHORTCUTS,
  mergeFeedByPresentation,
  orderByFocusRank,
  projectCatalystFeedRowV3,
} from "../src/lib/catalyst-feed-v3/index.ts";
import { rankForFocusMode } from "../src/lib/focus-mode/rank.ts";
import { PLATFORM_GUIDE_VERSION } from "../src/lib/platform-guide.ts";
import type { CatalystItem } from "../src/types/index.ts";
import type { JudgmentV2 } from "../src/lib/judgment/types.ts";

function baseCatalyst(
  partial: Partial<CatalystItem> &
    Pick<CatalystItem, "id" | "symbol" | "headline" | "source" | "publishedAt">
): CatalystItem {
  return {
    verifiedConfidence: 80,
    catalystType: "analyst",
    price: 120,
    changePercent: 5.17,
    rVol: 2.5,
    floatShares: 50_000_000,
    marketCap: 2e9,
    volume: 3_000_000,
    avgVolume: 1_000_000,
    sentimentScore: 42,
    sentimentLabel: "Bullish",
    sourceUrl: "https://example.com/article",
    sourceTier: "wire",
    urgencyScore: 60,
    ...partial,
  };
}

const positiveJudgment: JudgmentV2 = {
  version: "judgment-v2.0",
  classifiedAt: new Date().toISOString(),
  verifiedFacts: ["Data-centre revenue estimates raised by Wedbush"],
  automatedInterpretation: ["Positive estimate revision"],
  missingOrUncertain: [],
  catalystStrength: "STRONG",
  directionalImplication: "POSITIVE",
  timing: "IMMEDIATE",
  tradeability: "LIQUID",
  confidence: "HIGH",
  riskFlags: [],
  scoreContributions: [],
  grade: "go",
  gradeLabel: "GO",
  gradeRationale: "Strong",
  disclaimer: "Not advice",
  changeLog: [],
};

test("feed v3 version + stable row height", () => {
  assert.match(CATALYST_FEED_V3_VERSION, /catalyst-feed-v3/);
  assert.equal(FEED_V3_ROW_HEIGHT_PX, 88);
  assert.ok(PLATFORM_GUIDE_VERSION >= 25);
});

test("collapsed projection: primary + headline + context; no default clutter", () => {
  const c = baseCatalyst({
    id: "amd-1",
    symbol: "amd",
    headline: "AMD raised — long noisy headline that should not dump float",
    source: "internal-pipeline-xyz",
    publishedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    judgmentV2: positiveJudgment,
    setupTags: ["gapper", "heavy-volume"],
  });
  const row = projectCatalystFeedRowV3(c, {
    nowMs: Date.now(),
    inWatchlist: true,
    prefs: DEFAULT_FEED_V3_PREFS,
  });

  assert.equal(row.symbol, "AMD");
  assert.equal(row.changePercent, 5.17);
  assert.equal(row.direction, "Positive");
  assert.ok(row.materialityLabel);
  assert.match(row.ageLabel, /5m|4m|6m/);
  assert.match(row.headline.toLowerCase(), /data-centre|wedbush|revenue/);
  assert.equal(row.verificationLabel, "Verified");
  assert.ok(row.reactionStageLabel.length > 0);
  assert.ok(row.tradeabilityLabel.length > 0);
  assert.ok(row.topRiskLabel);
  assert.equal(row.inWatchlist, true);

  // Default collapsed extras off
  assert.equal(row.extras.sentimentScore, null);
  assert.equal(row.extras.floatLabel, null);
  assert.equal(row.extras.marketCapLabel, null);
  assert.equal(row.extras.gapper, false);
  assert.equal(row.extras.internalSource, null);
  assert.equal(row.extras.gradeLabel, null);
  assert.equal(row.extras.allRiskLabels.length, 0);

  // Accessibility label includes text, not colour-only
  const a11y = `${row.symbol} ${row.changePercent?.toFixed(2)}%, ${row.direction}, ${row.ageLabel}. ${row.headline}`;
  assert.match(a11y, /AMD/);
  assert.match(a11y, /Positive/);
});

test("semantic colour tokens cover direction + risk + system + brand", () => {
  assert.equal(FEED_V3_COLORS.positive.text, "tt-tone-positive");
  assert.equal(FEED_V3_COLORS.negative.text, "tt-tone-negative");
  assert.equal(FEED_V3_COLORS.risk.text, "tt-tone-risk");
  assert.equal(FEED_V3_COLORS.system.text, "tt-tone-system");
  assert.equal(FEED_V3_COLORS.meta.text, "tt-tone-meta");
  assert.equal(FEED_V3_COLORS.brand.text, "tt-tone-brand");
});

test("keyboard shortcuts live in modal map, include required keys", () => {
  const blob = FEED_V3_SHORTCUTS.map((s) => `${s.keys} ${s.action}`).join("\n");
  assert.match(blob, /j \/ k/i);
  assert.match(blob, /Enter/);
  assert.match(blob, /\bS\b/);
  assert.match(blob, /\bT\b/);
  assert.match(blob, /\bW\b/);
  assert.match(blob, /\bM\b/);
  assert.match(blob, /\bE\b/);
  assert.ok(!blob.toLowerCase().includes("permanently"));
});

test("Focus ranking: strategy > watchlist > materiality > freshness > risk; never P&L", () => {
  const now = Date.now();
  const items: CatalystItem[] = [
    baseCatalyst({
      id: "fresh-only",
      symbol: "AAA",
      headline: "Fresh",
      source: "Wire",
      publishedAt: new Date(now - 2 * 60_000).toISOString(),
      urgencyScore: 10,
      changePercent: 1,
      verifiedConfidence: 20,
    }),
    baseCatalyst({
      id: "watch",
      symbol: "WLST",
      headline: "Watchlist name",
      source: "Wire",
      publishedAt: new Date(now - 30 * 60_000).toISOString(),
      urgencyScore: 20,
      changePercent: 2,
    }),
    baseCatalyst({
      id: "rule",
      symbol: "RULE",
      headline: "Strategy match",
      source: "Wire",
      publishedAt: new Date(now - 45 * 60_000).toISOString(),
      urgencyScore: 15,
      changePercent: 1.5,
    }),
    baseCatalyst({
      id: "material",
      symbol: "MAT",
      headline: "Material move",
      source: "Wire",
      publishedAt: new Date(now - 90 * 60_000).toISOString(),
      urgencyScore: 90,
      changePercent: 25,
      verifiedConfidence: 90,
    }),
    baseCatalyst({
      id: "risk",
      symbol: "RSK",
      headline: "Offering risk",
      source: "Wire",
      publishedAt: new Date(now - 20 * 60_000).toISOString(),
      catalystType: "offering",
      urgencyScore: 5,
      changePercent: 0.5,
      judgmentV2: {
        ...positiveJudgment,
        directionalImplication: "NEGATIVE",
        riskFlags: [
          {
            id: "dilution",
            label: "Dilution language",
            severity: "high",
            detail: "ATM",
          },
        ],
      },
    }),
  ];

  const ranked = rankForFocusMode(items, {
    watchlist: new Set(["WLST"]),
    nowMs: now,
    ruleMatchedIds: new Set(["rule"]),
  });

  assert.equal(ranked[0].catalystId, "rule");
  assert.equal(ranked[1].catalystId, "watch");
  assert.ok(ranked.every((r) => r.profitabilityNotUsed === true));
  assert.ok(
    !JSON.stringify(ranked).toLowerCase().includes("profitability score")
  );

  const ordered = orderByFocusRank(items, {
    watchlist: ["WLST"],
    nowMs: now,
    ruleMatchedIds: new Set(["rule"]),
  });
  assert.equal(ordered[0].id, "rule");
  assert.equal(ordered[1].symbol, "WLST");
});

test("SSE merge preserves unchanged row identity; reports only changed ids", () => {
  const now = Date.now();
  const a = baseCatalyst({
    id: "stable",
    symbol: "AMD",
    headline: "Unchanged story",
    source: "Wire",
    publishedAt: new Date(now - 60_000).toISOString(),
    judgmentV2: positiveJudgment,
  });
  const b = baseCatalyst({
    id: "moves",
    symbol: "NVDA",
    headline: "Old headline",
    source: "Wire",
    publishedAt: new Date(now - 120_000).toISOString(),
    changePercent: 1,
    judgmentV2: positiveJudgment,
  });
  const prev = [a, b];
  const incoming = [
    { ...a },
    {
      ...b,
      changePercent: 9.5,
      headline: "Updated headline",
    },
    baseCatalyst({
      id: "new",
      symbol: "TSLA",
      headline: "Brand new",
      source: "Wire",
      publishedAt: new Date(now).toISOString(),
    }),
  ];

  const { next, changedIds } = mergeFeedByPresentation(prev, incoming, {
    nowMs: now,
  });
  assert.equal(next.length, 3);
  assert.strictEqual(next[0], a, "unchanged row keeps object identity");
  assert.notStrictEqual(next[1], b);
  assert.ok(changedIds.includes("moves"));
  assert.ok(changedIds.includes("new"));
  assert.ok(!changedIds.includes("stable"));
});

test("live-update profile: project + merge for 500 and 2000 events", () => {
  const now = Date.now();
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      baseCatalyst({
        id: `c${i}`,
        symbol: `T${i % 400}`,
        headline: `Headline ${i} verified fact summary for row`,
        source: "Wire",
        publishedAt: new Date(now - (i % 200) * 60_000).toISOString(),
        changePercent: (i % 20) - 10,
        judgmentV2: positiveJudgment,
      })
    );

  for (const n of [500, 2000] as const) {
    const items = make(n);
    const t0 = performance.now();
    for (const c of items) {
      projectCatalystFeedRowV3(c, { nowMs: now });
    }
    const projectMs = performance.now() - t0;

    const slightly = items.map((c, i) =>
      i % 17 === 0 ? { ...c, changePercent: (c.changePercent ?? 0) + 0.5 } : c
    );
    const t1 = performance.now();
    const { changedIds } = mergeFeedByPresentation(items, slightly, {
      nowMs: now,
    });
    const mergeMs = performance.now() - t1;

    // Soft budgets — fail only if pathological (seconds for thousands)
    assert.ok(
      projectMs < 8_000,
      `project ${n} took ${projectMs.toFixed(0)}ms`
    );
    assert.ok(mergeMs < 12_000, `merge ${n} took ${mergeMs.toFixed(0)}ms`);
    assert.ok(changedIds.length > 0);
    assert.ok(changedIds.length < n / 2);
  }
});

test("direction falls back to sentiment/type when judgment missing", () => {
  const bullish = baseCatalyst({
    id: "dir-1",
    symbol: "BULL",
    headline: "Company announces FDA approval for new therapy",
    source: "PR Newswire",
    publishedAt: new Date().toISOString(),
    catalystType: "fda",
    sentimentScore: 55,
    sentimentLabel: "Bullish",
    judgmentV2: undefined,
  });
  assert.equal(projectCatalystFeedRowV3(bullish).direction, "Positive");

  const offering = baseCatalyst({
    id: "dir-2",
    symbol: "BEAR",
    headline: "Company announces registered direct offering",
    source: "SEC EDGAR",
    publishedAt: new Date().toISOString(),
    catalystType: "offering",
    sentimentScore: 10,
    sentimentLabel: "Neutral",
    judgmentV2: undefined,
  });
  assert.equal(projectCatalystFeedRowV3(offering).direction, "Negative");
});

test("advanced prefs surface extras without changing classification fields", () => {
  const c = baseCatalyst({
    id: "prefs",
    symbol: "XYZ",
    headline: "Test",
    source: "pipeline-internal",
    publishedAt: new Date().toISOString(),
    judgmentV2: positiveJudgment,
    setupTags: ["gapper"],
  });
  const row = projectCatalystFeedRowV3(c, {
    prefs: {
      showFloat: true,
      showMarketCap: true,
      showSentimentScore: true,
      showGapperLabel: true,
      showAllRisks: true,
      showInternalSourceName: true,
      showGradeColumn: true,
    },
  });
  assert.ok(row.extras.floatLabel);
  assert.ok(row.extras.marketCapLabel);
  assert.equal(row.extras.sentimentScore, 42);
  assert.equal(row.extras.gapper, true);
  assert.equal(row.extras.internalSource, "pipeline-internal");
  assert.equal(row.extras.gradeLabel, "Legacy go (compat)");
  assert.equal(row.direction, "Positive");
});
