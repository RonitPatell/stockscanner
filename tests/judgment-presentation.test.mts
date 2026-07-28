/**
 * Judgment presentation adapter — regression for contradictory combinations.
 * Presentation only; does not alter classification engines.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  JUDGMENT_PRESENTATION_VERSION,
  JUDGMENT_SEPARATION_NOTE,
  presentJudgment,
  presentMateriality,
  presentDirection,
  inferDirectionalImplication,
  presentReactionStage,
  presentTradeability,
  presentSessionBias,
  presentationLooksLikeTradeInstruction,
} from "../src/lib/judgment/present.ts";
import { judgmentV2ToTradeJudgment } from "../src/lib/judgment/build-v2.ts";
import { PLATFORM_GUIDE_VERSION } from "../src/lib/platform-guide.ts";
import type { JudgmentV2 } from "../src/lib/judgment/types.ts";

function baseJudgment(over: Partial<JudgmentV2>): JudgmentV2 {
  return {
    version: "judgment-v2.0",
    classifiedAt: new Date().toISOString(),
    verifiedFacts: ["Verified fact"],
    automatedInterpretation: ["Automated note"],
    missingOrUncertain: [],
    catalystStrength: "MODERATE",
    directionalImplication: "UNCLEAR",
    timing: "IMMEDIATE",
    tradeability: "ACCEPTABLE",
    confidence: "MEDIUM",
    riskFlags: [],
    scoreContributions: [],
    grade: "watch",
    gradeLabel: "WATCH",
    gradeRationale: "compat",
    disclaimer: "Not advice",
    changeLog: [],
    ...over,
  };
}

test("adapter version + guide bumped", () => {
  assert.match(JUDGMENT_PRESENTATION_VERSION, /judgment-present/);
  assert.ok(PLATFORM_GUIDE_VERSION >= 26);
  assert.ok(JUDGMENT_SEPARATION_NOTE.toLowerCase().includes("not a buy"));
});

test("High materiality + Negative direction both visible (not collapsed to GO)", () => {
  const j = baseJudgment({
    catalystStrength: "STRONG",
    directionalImplication: "NEGATIVE",
    grade: "go",
    gradeLabel: "GO",
  });
  const p = presentJudgment({ judgment: j });
  assert.equal(p.materiality, "High");
  assert.equal(p.direction, "Negative");
  assert.ok(p.dimensionsLine.includes("Materiality High"));
  assert.ok(p.dimensionsLine.includes("Direction Negative"));
  assert.ok(!/\bGO\b/.test(p.dimensionsLine));
  assert.ok(!/\bLONG\b/.test(p.dimensionsLine));
  assert.equal(p.legacyGrade, "go"); // preserved for API/compat
  assert.equal(p.reviewPriority, "Immediate review");
  assert.ok(!presentationLooksLikeTradeInstruction(p.dimensionsLine));
  assert.ok(!presentationLooksLikeTradeInstruction(p.separationNote));
});

test("Strong catalyst + Extremely thin tradeability both visible", () => {
  const j = baseJudgment({
    catalystStrength: "STRONG",
    directionalImplication: "POSITIVE",
    tradeability: "EXTREMELY_THIN",
    grade: "skip",
  });
  const p = presentJudgment({ judgment: j });
  assert.equal(p.materiality, "High");
  assert.equal(p.direction, "Positive");
  assert.equal(p.tradeability, "Extremely thin");
  assert.ok(p.ariaLabel.includes("Extremely thin"));
  assert.ok(p.ariaLabel.includes("Positive"));
});

test("Positive direction + Extended reaction both visible", () => {
  const j = baseJudgment({
    catalystStrength: "MODERATE",
    directionalImplication: "POSITIVE",
    timing: "IMMEDIATE",
  });
  const p = presentJudgment({
    judgment: j,
    reactionStage: "EXTENDED",
  });
  assert.equal(p.direction, "Positive");
  assert.equal(p.reactionStage, "Extended");
  assert.ok(p.dimensionsLine.includes("Reaction Extended"));
});

test("Negative direction + active dilution risk", () => {
  const j = baseJudgment({
    catalystStrength: "STRONG",
    directionalImplication: "NEGATIVE",
    riskFlags: [
      {
        id: "dilution",
        label: "Active dilution / ATM language",
        severity: "high",
        detail: "Offering",
      },
      {
        id: "thin",
        label: "Thin float",
        severity: "low",
        detail: "x",
      },
    ],
  });
  const p = presentJudgment({ judgment: j });
  assert.equal(p.direction, "Negative");
  assert.equal(p.topRisk, "Active dilution / ATM language");
  assert.ok(p.dimensionsLine.includes("Active dilution"));
});

test("Unknown market data surfaces Unknown tradeability + reaction", () => {
  const p = presentJudgment({
    judgment: null,
    tradeability: "UNKNOWN",
    reactionStage: "UNKNOWN",
  });
  assert.equal(p.materiality, "Not material");
  assert.equal(p.direction, "Unclear");
  assert.equal(p.reactionStage, "Unknown");
  assert.equal(p.tradeability, "Unknown");
});

test("UNCLEAR judgment yields to directionalImplication fallback", () => {
  const j = baseJudgment({ directionalImplication: "UNCLEAR" });
  const p = presentJudgment({
    judgment: j,
    directionalImplication: "POSITIVE",
  });
  assert.equal(p.direction, "Positive");
});

test("inferDirectionalImplication uses type and headline", () => {
  assert.equal(
    inferDirectionalImplication({
      catalystType: "fda",
      headline: "FDA approval granted",
    }),
    "POSITIVE"
  );
  assert.equal(
    inferDirectionalImplication({
      catalystType: "offering",
      headline: "Registered direct offering priced",
    }),
    "NEGATIVE"
  );
  assert.equal(
    inferDirectionalImplication({
      catalystType: "other",
      sentimentLabel: "Bullish",
      sentimentScore: 40,
    }),
    "POSITIVE"
  );
});

test("enum mappers cover all declared labels", () => {
  assert.equal(presentMateriality("STRONG"), "High");
  assert.equal(presentMateriality("MODERATE"), "Medium");
  assert.equal(presentMateriality("WEAK"), "Low");
  assert.equal(presentMateriality("NOT_MATERIAL"), "Not material");
  assert.equal(presentDirection("POSITIVE"), "Positive");
  assert.equal(presentDirection("NEGATIVE"), "Negative");
  assert.equal(presentDirection("MIXED"), "Mixed");
  assert.equal(presentDirection("UNCLEAR"), "Unclear");
  assert.equal(presentReactionStage("EARLY"), "Early");
  assert.equal(presentReactionStage("ACTIVE"), "Active");
  assert.equal(presentReactionStage("EXTENDED"), "Extended");
  assert.equal(presentReactionStage("STALE"), "Stale");
  assert.equal(presentReactionStage(null), "Unknown");
  assert.equal(presentTradeability("LIQUID"), "Liquid");
  assert.equal(presentTradeability("ACCEPTABLE"), "Acceptable");
  assert.equal(presentTradeability("THIN"), "Thin");
  assert.equal(presentTradeability("EXTREMELY_THIN"), "Extremely thin");
  assert.equal(presentTradeability(null), "Unknown");
});

test("legacy TradeJudgment projection does not primary-label GO/LONG/SHORT", () => {
  const j = baseJudgment({
    catalystStrength: "STRONG",
    directionalImplication: "NEGATIVE",
    grade: "go",
    gradeLabel: "GO",
  });
  const legacy = judgmentV2ToTradeJudgment(j);
  assert.equal(legacy.grade, "go"); // DB/API value preserved
  assert.ok(!/^GO$/i.test(legacy.label));
  assert.ok(!/long bias|short bias|buy|sell/i.test(legacy.summary));
  assert.ok(legacy.summary.includes("Materiality"));
  assert.ok(legacy.summary.includes("Direction"));
  assert.ok(!presentationLooksLikeTradeInstruction(legacy.nextStep));
});

test("session bias presents as direction + review, not long/short instruction", () => {
  assert.deepEqual(presentSessionBias("long"), {
    direction: "Positive",
    reviewLabel: "Review candidate",
  });
  assert.deepEqual(presentSessionBias("short"), {
    direction: "Negative",
    reviewLabel: "Review candidate",
  });
  assert.deepEqual(presentSessionBias("avoid"), {
    direction: "Unclear",
    reviewLabel: "Capital caution",
  });
});
