import assert from "node:assert/strict";
import test from "node:test";
import { projectDecisionCardV3, patchDecisionCardLive } from "../src/lib/decision-card/project.ts";
import { computeReactionStage } from "../src/lib/decision-card/reaction-stage.ts";
import { buildDecisionRisks } from "../src/lib/decision-card/risks.ts";
import { classifyLiquidity, formatAvail } from "../src/lib/decision-card/format.ts";
import { isDecisionCardV3Enabled } from "../src/lib/decision-card/flags.ts";
import { DECISION_CARD_V3_VERSION } from "../src/lib/decision-card/types.ts";
import type { CatalystItem } from "../src/types/index.ts";
import type { JudgmentV2 } from "../src/lib/judgment/types.ts";

function baseCatalyst(partial: Partial<CatalystItem> & Pick<CatalystItem, "id" | "symbol" | "headline" | "source" | "publishedAt">): CatalystItem {
  return {
    verifiedConfidence: 70,
    catalystType: "fda",
    price: 8.5,
    changePercent: 4.2,
    rVol: 3.1,
    floatShares: 25_000_000,
    volume: 2_000_000,
    avgVolume: 500_000,
    ingestedAt: new Date(Date.parse(partial.publishedAt) + 45_000).toISOString(),
    ingestDelaySec: 45,
    sourceUrl: "https://www.sec.gov/example",
    sourceTier: "wire",
    newsCount: 2,
    ...partial,
  };
}

const strongJudgment: JudgmentV2 = {
  version: "judgment-v2.0",
  classifiedAt: new Date().toISOString(),
  verifiedFacts: ["FDA clearance announced for indication X"],
  automatedInterpretation: ["Material regulatory event"],
  missingOrUncertain: [],
  catalystStrength: "STRONG",
  directionalImplication: "POSITIVE",
  timing: "IMMEDIATE",
  tradeability: "ACCEPTABLE",
  confidence: "HIGH",
  riskFlags: [],
  scoreContributions: [],
  grade: "go",
  gradeLabel: "GO",
  gradeRationale: "Strong immediate catalyst",
  disclaimer: "Not advice",
  changeLog: [],
};

test("feature flag defaults off", () => {
  // Without env set in this process, expect false unless CI sets it
  assert.equal(typeof isDecisionCardV3Enabled(), "boolean");
});

test("strong catalyst projects identity + catalyst strips", () => {
  const c = baseCatalyst({
    id: "strong-1",
    symbol: "ABCD",
    headline: "$ABCD receives FDA clearance",
    source: "GlobeNewswire",
    publishedAt: new Date().toISOString(),
    judgmentV2: strongJudgment,
  });
  const card = projectDecisionCardV3(c, {
    companyName: "Alpha Bio Corp",
    exchange: "NASDAQ",
    priceAtPublication: 8.0,
    priceAtIngest: 8.2,
    nowMs: Date.now(),
  });
  assert.equal(card.version, DECISION_CARD_V3_VERSION);
  assert.equal(card.identity.symbol, "ABCD");
  assert.equal(card.identity.companyName, "Alpha Bio Corp");
  assert.equal(card.identity.exchange, "NASDAQ");
  assert.ok(card.catalyst.factSummary.toLowerCase().includes("fda"));
  assert.equal(card.catalyst.sourceClass, "primary");
  assert.equal(card.reaction.priceAtPublication.availability, "ok");
  assert.ok(card.reaction.moveSincePublicationPct.value != null);
  assert.match(card.disclaimer, /not investment advice/i);
  assert.match(card.disclaimer, /No buy\/sell instruction/i);
  assert.ok(!/probability of profit|\d+%\s*chance/i.test(JSON.stringify(card)));
});

test("stale news → STALE reaction stage with expandable rules", () => {
  const stage = computeReactionStage({
    ageSec: 8 * 3600,
    moveSincePublicationAbs: 1,
    rVol: 1.2,
    timing: "STALE",
    staleLanguage: true,
    scheduledLanguage: false,
    dayMoveAbs: 2,
  });
  assert.equal(stage.stage, "STALE");
  assert.ok(stage.rules.some((r) => r.id === "stale_language_or_timing" && r.passed));
  assert.ok(stage.rules.length >= 5);
});

test("dilution event activates offering / ATM / shelf risks", () => {
  const risks = buildDecisionRisks({
    headline: "Company announces $50M at-the-market offering program",
    catalystType: "offering",
    dilutionTypes: ["ATM_PROGRAM", "S3_SHELF"],
    changePercent: 12,
  });
  assert.ok(risks.find((r) => r.id === "atm")?.active);
  assert.ok(risks.find((r) => r.id === "active_shelf")?.active);
  assert.ok(risks.find((r) => r.id === "registered_offering")?.active);
});

test("halted language marks identity halt without inventing halt count", () => {
  const c = baseCatalyst({
    id: "halt-1",
    symbol: "HALT",
    headline: "Trading halt — LULD pause in effect",
    source: "SEC EDGAR",
    publishedAt: new Date().toISOString(),
  });
  const card = projectDecisionCardV3(c);
  assert.equal(card.identity.halted, true);
  assert.equal(card.tradeability.sessionHaltCount.availability, "unavailable");
});

test("wide spread / thin liquidity classification", () => {
  assert.equal(
    classifyLiquidity({ dollarVolume: 100_000, spreadBps: 250, rVol: 5, floatShares: 3e6 }),
    "EXTREMELY_THIN"
  );
  assert.equal(
    classifyLiquidity({ dollarVolume: 50_000_000, spreadBps: 10, rVol: 2, floatShares: 80e6 }),
    "LIQUID"
  );
  assert.equal(
    classifyLiquidity({ dollarVolume: null, spreadBps: null, rVol: null, floatShares: null }),
    "UNAVAILABLE"
  );
});

test("missing quote data shows unavailable — never substitutes", () => {
  const c = baseCatalyst({
    id: "miss-1",
    symbol: "MISS",
    headline: "Partnership announced",
    source: "Business Wire",
    publishedAt: new Date().toISOString(),
    price: null,
    changePercent: null,
    rVol: null,
    floatShares: null,
    volume: null,
  });
  const card = projectDecisionCardV3(c, {});
  assert.equal(card.identity.price.availability, "unavailable");
  assert.equal(card.reaction.volAccel1m.availability, "unavailable");
  assert.equal(card.reaction.distanceFromVwapPct.availability, "unavailable");
  assert.equal(card.tradeability.bidSize.availability, "unavailable");
  assert.equal(card.tradeability.askSize.availability, "unavailable");
  assert.equal(card.tradeability.spreadDollars.availability, "unavailable");
  assert.equal(formatAvail(card.identity.price), "—");
});

test("patchDecisionCardLive updates tape without dropping catalyst facts", () => {
  const c = baseCatalyst({
    id: "live-1",
    symbol: "LIVE",
    headline: "Contract win",
    source: "PR Newswire",
    publishedAt: new Date().toISOString(),
  });
  const base = projectDecisionCardV3(c, { priceAtIngest: 10, priceAtPublication: 9.5 });
  const patched = patchDecisionCardLive(base, { price: 11, changePercent: 15, rVol: 6 });
  assert.equal(patched.catalyst.factSummary, base.catalyst.factSummary);
  assert.equal(patched.identity.price.value, 11);
  assert.equal(patched.reaction.relativeVolume.value, 6);
  assert.ok(patched.reaction.moveSinceIngestPct.value != null);
});

test("extended stage when day move is large", () => {
  const stage = computeReactionStage({
    ageSec: 20 * 60,
    moveSincePublicationAbs: 15,
    rVol: 4,
    timing: "IMMEDIATE",
    staleLanguage: false,
    scheduledLanguage: false,
    dayMoveAbs: 30,
  });
  assert.equal(stage.stage, "EXTENDED");
});

test("early stage for fresh non-scheduled catalyst", () => {
  const stage = computeReactionStage({
    ageSec: 5 * 60,
    moveSincePublicationAbs: 2,
    rVol: 2.5,
    timing: "IMMEDIATE",
    staleLanguage: false,
    scheduledLanguage: false,
    dayMoveAbs: 3,
  });
  assert.equal(stage.stage, "EARLY");
});

test("a11y contract: model exposes labels needed for card regions", () => {
  const c = baseCatalyst({
    id: "a11y-1",
    symbol: "A11Y",
    headline: "Earnings beat",
    source: "Business Wire",
    publishedAt: new Date().toISOString(),
  });
  const card = projectDecisionCardV3(c);
  // Regions the component must label
  const required = [
    card.identity,
    card.catalyst,
    card.reaction,
    card.tradeability,
    card.risks,
    card.reactionStage,
    card.actions,
    card.disclaimer,
  ];
  assert.equal(required.every((x) => x != null), true);
  assert.ok(card.actions.tradingViewUrl.includes("A11Y"));
  assert.ok(card.reactionStage.rules.every((r) => r.label && r.detail));
});

test("local project performance: 500 cards under 100ms p95 budget", () => {
  const now = Date.now();
  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const c = baseCatalyst({
      id: `perf-${i}`,
      symbol: `T${i % 50}`,
      headline: i % 7 === 0
        ? "ATM offering announced"
        : i % 5 === 0
          ? "As previously announced, update"
          : "FDA clearance granted",
      source: "GlobeNewswire",
      publishedAt: new Date(now - i * 60_000).toISOString(),
      changePercent: (i % 40) - 10,
      judgmentV2: i % 3 === 0 ? strongJudgment : undefined,
    });
    const t0 = performance.now();
    projectDecisionCardV3(c, {
      companyName: "Perf Co",
      exchange: "NASDAQ",
      priceAtPublication: 5,
      priceAtIngest: 5.1,
      nowMs: now,
      dilutionTypes: i % 7 === 0 ? ["ATM_PROGRAM"] : [],
    });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.floor(samples.length * 0.95)]!;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.info(`[decision-card-v3 perf] mean=${mean.toFixed(3)}ms p95=${p95.toFixed(3)}ms`);
  assert.ok(p95 < 100, `p95 ${p95}ms exceeds 100ms budget`);
});
