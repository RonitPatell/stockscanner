/**
 * Seeded workflow fixtures for Playwright audit of Shell V3 + Feed V3 + Focus V2.
 * Presentation fixtures only — not live market data.
 */
import type { CatalystItem } from "../../src/types/index.ts";
import type { JudgmentV2 } from "../../src/lib/judgment/types.ts";

const now = () => Date.now();
const minsAgo = (m: number) => new Date(now() - m * 60_000).toISOString();

export const SEED_OFFERING_ID = "seed-abcd-offering";
export const SEED_FDA_ID = "seed-mrna-fda";
export const SEED_EARNINGS_ID = "seed-smci-earn";

const offeringJudgment: JudgmentV2 = {
  version: "judgment-v2.0",
  classifiedAt: minsAgo(10),
  verifiedFacts: ["ABCD prices $40M registered direct offering at $2.50."],
  automatedInterpretation: ["Dilutive capital raise"],
  missingOrUncertain: ["Warrant coverage not confirmed in headline"],
  catalystStrength: "STRONG",
  directionalImplication: "NEGATIVE",
  timing: "IMMEDIATE",
  tradeability: "THIN",
  confidence: "HIGH",
  riskFlags: [
    {
      id: "registered_offering",
      label: "Registered offering",
      severity: "high",
      detail: "Registered direct language in primary source",
    },
  ],
  scoreContributions: [],
  grade: "skip",
  gradeLabel: "SKIP",
  gradeRationale: "Offering risk",
  disclaimer: "Not financial advice",
  changeLog: [],
};

const fdaJudgment: JudgmentV2 = {
  version: "judgment-v2.0",
  classifiedAt: minsAgo(3),
  verifiedFacts: ["Phase 3 primary endpoint met; FDA fast track confirmed."],
  automatedInterpretation: ["Positive regulatory acceleration"],
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
  gradeRationale: "Strong material catalyst",
  disclaimer: "Not financial advice",
  changeLog: [],
};

/** Ordered so Focus priority should surface MRNA / ABCD first. */
export function buildWorkflowCatalysts(): CatalystItem[] {
  return [
    {
      id: SEED_FDA_ID,
      symbol: "MRNA",
      headline:
        "Phase 3 trial shows 94% efficacy; FDA fast track granted for lead candidate",
      source: "GlobeNewswire",
      sourceUrl: "https://example.com/seed/mrna-fda",
      publishedAt: minsAgo(3),
      ingestedAt: minsAgo(2),
      ingestDelaySec: 45,
      aiSummary: "Phase 3 primary endpoint met with FDA fast track.",
      changePercent: 16.94,
      price: 118.4,
      volume: 18_200_000,
      avgVolume: 6_100_000,
      rVol: 4.2,
      floatShares: 380_000_000,
      catalystType: "fda",
      urgencyScore: 92,
      verifiedConfidence: 94,
      sourceTier: "wire",
      judgmentV2: fdaJudgment,
    },
    {
      id: SEED_OFFERING_ID,
      symbol: "ABCD",
      headline: "ABCD announces $40M registered direct offering",
      source: "SEC EDGAR",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000202/424b5.htm",
      publishedAt: minsAgo(8),
      ingestedAt: minsAgo(7),
      ingestDelaySec: 60,
      aiSummary: "Registered direct offering priced; dilution risk elevated.",
      changePercent: -18.4,
      price: 1.12,
      volume: 5_000_000,
      avgVolume: 600_000,
      rVol: 8.1,
      floatShares: 12_000_000,
      catalystType: "offering",
      urgencyScore: 88,
      verifiedConfidence: 91,
      sourceTier: "sec",
      judgmentV2: offeringJudgment,
    },
    {
      id: SEED_EARNINGS_ID,
      symbol: "SMCI",
      headline:
        "Raises full-year revenue guidance on record AI server backlog",
      source: "Business Wire",
      sourceUrl: "https://example.com/seed/smci",
      publishedAt: minsAgo(15),
      ingestedAt: minsAgo(14),
      changePercent: 11.28,
      price: 842.1,
      volume: 9_400_000,
      avgVolume: 4_100_000,
      rVol: 3.1,
      floatShares: 52_000_000,
      catalystType: "earnings",
      urgencyScore: 70,
      verifiedConfidence: 80,
      sourceTier: "wire",
      judgmentV2: {
        ...fdaJudgment,
        verifiedFacts: ["Full-year revenue guidance raised on AI backlog."],
        directionalImplication: "POSITIVE",
        tradeability: "LIQUID",
      },
    },
  ];
}

export function buildDilutionSeed() {
  return {
    items: [
      {
        id: SEED_OFFERING_ID,
        symbol: "ABCD",
        headline: "Registered direct — $40M / 424B5",
        changePercent: -18.4,
        why: "Active registered direct offering — confirm warrant and ATM terms in filing.",
        sourceUrl:
          "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000202/424b5.htm",
        capacityNote: "Structured from prospectus supplement language",
        potentialDilutionPct: 12.5,
        estimateLabel: "estimate",
        status: "active",
        capacityKind: "registered_direct",
        instrumentLabel: "424B5",
      },
    ],
  };
}

/** Local feedback seed for Review journey */
export function buildFeedbackLocalSeed() {
  return [
    {
      id: "td_seed_abcd_1",
      schemaVersion: "trader-feedback-v1.0",
      action: "skipped",
      reason: "dilution",
      reasonNote: "Registered direct — waited for filing confirm",
      catalystId: SEED_OFFERING_ID,
      symbol: "ABCD",
      headline: "ABCD announces $40M registered direct offering",
      decidedAt: minsAgo(30),
      entryPrice: null,
      exitPrice: null,
      positionSize: null,
      side: null,
      alertId: null,
      alertRuleId: null,
      alertStrategyId: null,
      context: {
        catalystAgeMin: 5,
        reactionStage: "Early",
        tradeability: "Thin",
        risksVisible: ["registered_offering"],
        moveCompletedBeforeEntryPct: null,
        priceAtDecision: 1.2,
        publishedAt: minsAgo(35),
        catalystType: "offering",
        alertRuleId: null,
        alertStrategyId: null,
        alertStrategyVersion: null,
        followedOwnRules: true,
        missingInformation: ["Warrant coverage"],
      },
      mfePctAfter: null,
      maePctAfter: null,
      syncState: "local",
      updatedAt: minsAgo(30),
      outcomeNote: null,
      syncedAt: null,
    },
  ];
}

export const WORKFLOW_STATUS_SEED = {
  overall: "live",
  label: "Live",
  sources: [{ id: "wires", label: "Wires", state: "live" }],
  lastEventAt: new Date().toISOString(),
};
