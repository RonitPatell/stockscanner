import type { CatalystItem } from "../../types/index.ts";
import { isDilutionCatalyst } from "../action-playbook.ts";
import { isStaleStory } from "../alerts/modes.ts";
import {
  JUDGMENT_V2_VERSION,
  type CatalystStrength,
  type DirectionalImplication,
  type JudgmentConfidence,
  type JudgmentTiming,
  type JudgmentV2,
  type RiskFlag,
  type ScoreContribution,
  type TradeGrade,
  type Tradeability,
} from "./types.ts";

const BULL_TYPES = new Set([
  "fda",
  "contract",
  "earnings",
  "upgrade",
  "partnership",
  "buyback",
  "merger",
]);
const BEAR_TYPES = new Set([
  "downgrade",
  "lawsuit",
  "investigation",
  "bankruptcy",
  "offering",
  "dilution",
]);

const PROMO_RE =
  /\b(breaking\s+news|must\s+read|huge\s+news|to\s+the\s+moon|guaranteed|can't\s+miss|alert\s*!\s*!|massive\s+upside|10x\s+potential)\b/i;

const SCHEDULED_RE =
  /\b(scheduled|will\s+(report|announce|host)|upcoming|set\s+to\s+(report|announce)|conference\s+call\s+on|earnings\s+on|investor\s+day\s+on)\b/i;

const MIXED_EARNINGS_RE =
  /\b(beats?\s+on\s+eps\s+but\s+miss|misses?\s+revenue\s+but\s+beats?|mixed\s+results|raises?\s+guidance\s+but|cuts?\s+guidance\s+despite)\b/i;

function floatM(c: Pick<CatalystItem, "floatShares">): number | null {
  if (c.floatShares == null || c.floatShares <= 0) return null;
  return c.floatShares / 1e6;
}

function contrib(
  id: string,
  label: string,
  points: number,
  category: ScoreContribution["category"],
  detail: string
): ScoreContribution {
  return { id, label, points, category, detail };
}

/**
 * Build Judgment V2 — separates facts, interpretation, and uncertainty.
 * Deterministic and versioned for audit / reproducibility.
 */
export function buildJudgmentV2(
  c: Pick<
    CatalystItem,
    | "symbol"
    | "headline"
    | "source"
    | "sourceUrl"
    | "sourceTier"
    | "catalystType"
    | "sentimentScore"
    | "changePercent"
    | "rVol"
    | "floatShares"
    | "urgencyScore"
    | "historicalAvgMove"
    | "historicalSampleSize"
    | "setupTags"
    | "aiSummary"
    | "keyPoints"
    | "verifiedConfidence"
    | "matchMethod"
    | "publishedAt"
    | "price"
    | "volume"
    | "avgVolume"
  >,
  opts?: { previous?: JudgmentV2 | null; changeReason?: string }
): JudgmentV2 {
  const classifiedAt = new Date().toISOString();
  const type = (c.catalystType ?? "other").toLowerCase();
  const sentiment = c.sentimentScore ?? null;
  const move = c.changePercent ?? null;
  const absMove = Math.abs(move ?? 0);
  const rVol = c.rVol ?? null;
  const fM = floatM(c);
  const urgency = c.urgencyScore ?? null;
  const matchConf = c.verifiedConfidence ?? null;
  const dilution = isDilutionCatalyst(c);
  const promo = PROMO_RE.test(c.headline ?? "");
  const scheduledLang = SCHEDULED_RE.test(c.headline ?? "") || SCHEDULED_RE.test(c.aiSummary ?? "");
  const mixedEarnings = MIXED_EARNINGS_RE.test(c.headline ?? "") || MIXED_EARNINGS_RE.test(c.aiSummary ?? "");
  const stale = isStaleStory(c.publishedAt, 6);
  const wire = c.sourceTier === "wire" || c.sourceTier === "exchange";

  const verifiedFacts: string[] = [];
  const automatedInterpretation: string[] = [];
  const missingOrUncertain: string[] = [];
  const scoreContributions: ScoreContribution[] = [];
  const riskFlags: RiskFlag[] = [];

  // ── Verified facts ──────────────────────────────
  verifiedFacts.push(`Headline: “${(c.headline ?? "").slice(0, 160)}”`);
  if (c.source) verifiedFacts.push(`Source: ${c.source}${c.sourceTier ? ` (${c.sourceTier})` : ""}`);
  if (c.sourceUrl) verifiedFacts.push(`Evidence link available (open source URL)`);
  if (c.publishedAt) verifiedFacts.push(`Published at: ${c.publishedAt}`);
  if (c.symbol) verifiedFacts.push(`Assigned ticker: ${c.symbol}`);
  if (matchConf != null) {
    verifiedFacts.push(
      `Ticker-match score: ${Math.round(matchConf)}${c.matchMethod ? ` via ${c.matchMethod}` : ""}`
    );
  }
  if (move != null) verifiedFacts.push(`Session change (quote): ${move.toFixed(2)}%`);
  if (rVol != null) verifiedFacts.push(`Relative volume (quote): ${rVol.toFixed(1)}×`);
  if (fM != null) verifiedFacts.push(`Float (profile): ~${fM.toFixed(1)}M shares`);
  if (c.price != null) verifiedFacts.push(`Last price (quote): $${c.price.toFixed(2)}`);

  // ── Missing / uncertain ─────────────────────────
  if (sentiment == null) missingOrUncertain.push("Sentiment score not available");
  if (move == null) missingOrUncertain.push("Live % change not available — tradeability incomplete");
  if (rVol == null) missingOrUncertain.push("Relative volume not available");
  if (fM == null) missingOrUncertain.push("Float / liquidity profile unknown");
  if (matchConf == null || matchConf < 45) {
    missingOrUncertain.push("Ticker match confidence is low or missing — verify the symbol");
  }
  if (!c.sourceUrl) missingOrUncertain.push("No direct source URL on this row");
  if (type === "other" || !c.catalystType) {
    missingOrUncertain.push("Catalyst category is unclear");
  }

  // ── Score contributions (auditable) ─────────────
  let materialScore = 0;
  let directionScore = 0;

  if (wire) {
    const p = 8;
    materialScore += p;
    scoreContributions.push(
      contrib("wire_source", "Higher-trust source tier", p, "fact", `sourceTier=${c.sourceTier}`)
    );
  }

  if (type && type !== "other") {
    const p = BULL_TYPES.has(type) || BEAR_TYPES.has(type) ? 12 : 6;
    materialScore += p;
    scoreContributions.push(
      contrib("typed_catalyst", "Catalyst type classified", p, "interpretation", `type=${type}`)
    );
  } else {
    scoreContributions.push(
      contrib("untyped", "Unclear catalyst type", -8, "uncertainty", "type missing/other")
    );
    materialScore -= 8;
  }

  if (urgency != null && urgency >= 55) {
    materialScore += 10;
    scoreContributions.push(
      contrib("urgency_high", "Elevated urgency keywords/type", 10, "interpretation", `urgency=${urgency}`)
    );
  } else if (urgency != null && urgency < 25) {
    materialScore -= 6;
    scoreContributions.push(
      contrib("urgency_low", "Low urgency signal", -6, "interpretation", `urgency=${urgency}`)
    );
  }

  if (dilution) {
    materialScore += 5; // material event, but risk
    directionScore -= 35;
    scoreContributions.push(
      contrib("dilution", "Offering / dilution language", -35, "risk", "directional drag; capital risk")
    );
    riskFlags.push({
      id: "dilution",
      label: "Dilution / offering",
      severity: "high",
      detail: "Headline or type indicates share issuance risk",
    });
  }

  if (promo) {
    materialScore -= 15;
    scoreContributions.push(
      contrib("promo", "Promotional / hype language", -15, "risk", "treat as marketing, not verified catalyst")
    );
    riskFlags.push({
      id: "promotional",
      label: "Promotional language",
      severity: "medium",
      detail: "Headline uses hype phrasing",
    });
  }

  if (stale) {
    materialScore -= 12;
    scoreContributions.push(
      contrib("stale", "Story age suggests staleness", -12, "uncertainty", "published >6h ago")
    );
    riskFlags.push({
      id: "stale",
      label: "Possibly stale",
      severity: "medium",
      detail: "Article is older than the fresh-news window",
    });
  }

  if (mixedEarnings) {
    directionScore += 0;
    scoreContributions.push(
      contrib("mixed_earnings", "Mixed earnings language", 0, "interpretation", "beat/miss conflict")
    );
  } else if (sentiment != null) {
    if (sentiment >= 40) {
      directionScore += 20;
      scoreContributions.push(
        contrib("sentiment_pos", "Constructive tone score", 20, "interpretation", `sentiment=${sentiment}`)
      );
    } else if (sentiment <= -40) {
      directionScore -= 20;
      scoreContributions.push(
        contrib("sentiment_neg", "Negative tone score", -20, "interpretation", `sentiment=${sentiment}`)
      );
    } else {
      scoreContributions.push(
        contrib("sentiment_neutral", "Neutral tone score", 0, "interpretation", `sentiment=${sentiment}`)
      );
    }
  }

  if (BULL_TYPES.has(type) && !dilution) {
    directionScore += 18;
    scoreContributions.push(
      contrib("bull_type", "Historically constructive type", 18, "interpretation", `type=${type}`)
    );
  }
  if (BEAR_TYPES.has(type)) {
    directionScore -= 18;
    scoreContributions.push(
      contrib("bear_type", "Historically adverse type", -18, "interpretation", `type=${type}`)
    );
  }

  if (matchConf != null && matchConf < 45) {
    materialScore -= 10;
    scoreContributions.push(
      contrib("weak_match", "Weak ticker match", -10, "uncertainty", `confidence=${matchConf}`)
    );
    riskFlags.push({
      id: "ambiguous_ticker",
      label: "Ambiguous ticker match",
      severity: "high",
      detail: "Match confidence below publish floor — confirm symbol before acting",
    });
  }

  if (absMove >= 25) {
    riskFlags.push({
      id: "extended",
      label: "Already extended",
      severity: "high",
      detail: `|change| ${absMove.toFixed(1)}% — chase risk`,
    });
    scoreContributions.push(
      contrib("extended_tape", "Large session extension", -10, "risk", `absMove=${absMove.toFixed(1)}`)
    );
    materialScore -= 4;
  }

  // Positive news + dilution → MIXED / NOT clean GO
  const positiveTone =
    (sentiment != null && sentiment >= 30) || (BULL_TYPES.has(type) && !dilution);
  if (positiveTone && dilution) {
    automatedInterpretation.push(
      "Headline mixes constructive framing with dilution/offering risk — treat as mixed, not a clean positive."
    );
    riskFlags.push({
      id: "positive_with_dilution",
      label: "Positive framing + dilution",
      severity: "high",
      detail: "Do not treat as a clean bullish catalyst",
    });
  }

  // ── Axes ────────────────────────────────────────
  let catalystStrength: CatalystStrength;
  if (dilution && promo) catalystStrength = "WEAK";
  else if (materialScore >= 25 && !promo && (urgency ?? 0) >= 40) catalystStrength = "STRONG";
  else if (materialScore >= 10 || (type !== "other" && type)) catalystStrength = "MODERATE";
  else if (materialScore <= -5 || promo || (matchConf != null && matchConf < 30))
    catalystStrength = "NOT_MATERIAL";
  else catalystStrength = "WEAK";

  if (promo && catalystStrength === "STRONG") catalystStrength = "WEAK";

  let directionalImplication: DirectionalImplication;
  if (dilution && positiveTone) directionalImplication = "MIXED";
  else if (mixedEarnings) directionalImplication = "MIXED";
  else if (directionScore >= 18) directionalImplication = "POSITIVE";
  else if (directionScore <= -18) directionalImplication = "NEGATIVE";
  else if (Math.abs(directionScore) < 8 && (sentiment == null || Math.abs(sentiment) < 25))
    directionalImplication = "UNCLEAR";
  else if (directionScore > 0) directionalImplication = "POSITIVE";
  else if (directionScore < 0) directionalImplication = "NEGATIVE";
  else directionalImplication = "UNCLEAR";

  let timing: JudgmentTiming;
  if (stale) timing = "STALE";
  else if (scheduledLang) timing = "SCHEDULED";
  else if ((urgency ?? 0) >= 55 || wire) timing = "IMMEDIATE";
  else timing = "TODAY";

  let tradeability: Tradeability;
  if (fM != null && fM < 5) tradeability = "EXTREMELY_THIN";
  else if (fM != null && fM < 20) tradeability = "THIN";
  else if (rVol != null && rVol >= 2 && (fM == null || fM >= 20)) tradeability = "LIQUID";
  else if (fM != null && fM >= 20) tradeability = "ACCEPTABLE";
  else if (rVol == null && fM == null) {
    tradeability = "ACCEPTABLE";
    missingOrUncertain.push("Tradeability assumed ACCEPTABLE without float/RVol — verify liquidity");
  } else tradeability = "ACCEPTABLE";

  if (tradeability === "EXTREMELY_THIN" || tradeability === "THIN") {
    riskFlags.push({
      id: "thin_liquidity",
      label: tradeability === "EXTREMELY_THIN" ? "Extremely thin float" : "Thin float",
      severity: tradeability === "EXTREMELY_THIN" ? "high" : "medium",
      detail: fM != null ? `float≈${fM.toFixed(1)}M` : "low float inferred",
    });
  }

  // Confidence from match + missing data + promo/stale
  let confPts = 50;
  if (matchConf != null) confPts += Math.min(25, (matchConf - 40) / 2);
  if (wire) confPts += 8;
  confPts -= missingOrUncertain.length * 4;
  if (promo) confPts -= 12;
  if (stale) confPts -= 8;
  if (dilution) confPts += 5; // dilution detection is relatively certain
  confPts = Math.max(5, Math.min(95, confPts));

  let confidence: JudgmentConfidence =
    confPts >= 70 ? "HIGH" : confPts >= 45 ? "MEDIUM" : "LOW";

  // Interpretations (labeled automated)
  automatedInterpretation.push(
    `Automated catalyst strength: ${catalystStrength} (material score ${materialScore}).`
  );
  automatedInterpretation.push(
    `Automated directional implication: ${directionalImplication} (direction score ${directionScore}).`
  );
  automatedInterpretation.push(`Automated timing: ${timing}; tradeability: ${tradeability}.`);
  if (c.aiSummary) {
    automatedInterpretation.push(`Ingest summary (automated): ${c.aiSummary.slice(0, 220)}`);
  }

  // Map to GO/WATCH/SKIP — never framed as personal advice
  let grade: TradeGrade;
  let gradeRationale: string;

  if (
    dilution ||
    catalystStrength === "NOT_MATERIAL" ||
    tradeability === "EXTREMELY_THIN" ||
    (riskFlags.some((r) => r.id === "ambiguous_ticker") && confidence === "LOW") ||
    (absMove >= 25 && directionalImplication !== "NEGATIVE")
  ) {
    grade = "skip";
    gradeRationale =
      "SKIP from V2: dilution, non-material, extremely thin liquidity, ambiguous ticker, or chase-extension risk.";
  } else if (
    catalystStrength === "STRONG" &&
    (directionalImplication === "POSITIVE" || directionalImplication === "NEGATIVE") &&
    timing !== "STALE" &&
    timing !== "SCHEDULED" &&
    confidence !== "LOW" &&
    tradeability !== "THIN" &&
    absMove < 12
  ) {
    grade = "go";
    gradeRationale =
      "GO from V2: strong material catalyst, clear direction, fresh timing, acceptable liquidity — still a desk aid, not advice.";
  } else {
    grade = "watch";
    gradeRationale =
      "WATCH from V2: something material may be present, but confirmation, liquidity, timing, or confidence is incomplete.";
  }

  // Scheduled events → prefer WATCH even if otherwise strong
  if (timing === "SCHEDULED" && grade === "go") {
    grade = "watch";
    gradeRationale =
      "WATCH from V2: event appears scheduled/future — not an immediate tradeable print.";
  }

  const changeLog = [...(opts?.previous?.changeLog ?? [])];
  if (opts?.previous && opts.previous.grade !== grade) {
    changeLog.push({
      at: classifiedAt,
      reason: opts.changeReason || "Reclassified with Judgment V2 inputs",
      previousGrade: opts.previous.grade,
      previousVersion: opts.previous.version,
    });
  }

  return {
    version: JUDGMENT_V2_VERSION,
    classifiedAt,
    verifiedFacts,
    automatedInterpretation,
    missingOrUncertain,
    catalystStrength,
    directionalImplication,
    timing,
    tradeability,
    confidence,
    riskFlags,
    scoreContributions,
    grade,
    gradeLabel: grade.toUpperCase(),
    gradeRationale,
    source: c.source,
    sourceUrl: c.sourceUrl,
    sourceTier: c.sourceTier,
    disclaimer:
      "Automated desk classification — not financial advice and not a personalized recommendation. Verify filings and quotes yourself.",
    changeLog,
  };
}

/** Project V2 → legacy TradeJudgment shape for existing UI. */
export function judgmentV2ToTradeJudgment(j: JudgmentV2): {
  grade: TradeGrade;
  label: string;
  summary: string;
  explanation: string;
  articleReasons: string[];
  performanceReasons: string[];
  checklist: {
    id: string;
    label: string;
    pass: boolean;
    tip: string;
  }[];
  confidence: number;
  nextStep: string;
  judgmentVersion: string;
  judgmentV2: JudgmentV2;
} {
  const confNum = j.confidence === "HIGH" ? 78 : j.confidence === "MEDIUM" ? 55 : 32;
  const articleReasons = [
    ...j.verifiedFacts.slice(0, 2),
    ...j.automatedInterpretation.slice(0, 2),
  ].slice(0, 4);
  const performanceReasons = j.scoreContributions
    .filter((s) => s.category === "fact" || s.id.includes("tape") || s.id.includes("extended"))
    .map((s) => `${s.label}: ${s.detail}`)
    .slice(0, 4);

  const checklist = [
    {
      id: "not-dilution",
      label: "Not an offering / dilution trap",
      pass: !j.riskFlags.some((r) => r.id === "dilution"),
      tip: "Dilution often traps early longs.",
    },
    {
      id: "material",
      label: "Catalyst looks material",
      pass: j.catalystStrength === "STRONG" || j.catalystStrength === "MODERATE",
      tip: "Weak/promo noise is not a trade.",
    },
    {
      id: "direction-clear",
      label: "Direction not UNCLEAR",
      pass: j.directionalImplication !== "UNCLEAR",
      tip: "Mixed or unclear → wait.",
    },
    {
      id: "fresh",
      label: "Not stale",
      pass: j.timing !== "STALE",
      tip: "Stale headlines are traps.",
    },
    {
      id: "liquidity",
      label: "Not extremely thin",
      pass: j.tradeability !== "EXTREMELY_THIN",
      tip: "Thin names slip hard.",
    },
  ];

  const summary =
    j.grade === "go"
      ? `Go — ${j.catalystStrength.toLowerCase()} / ${j.directionalImplication.toLowerCase()} (V2)`
      : j.grade === "skip"
        ? `Skip — ${j.riskFlags[0]?.label ?? j.catalystStrength} (V2)`
        : `Watch — ${j.timing.toLowerCase()} / ${j.confidence.toLowerCase()} confidence (V2)`;

  return {
    grade: j.grade,
    label: j.gradeLabel,
    summary,
    explanation: `${j.gradeRationale} ${j.disclaimer}`,
    articleReasons:
      articleReasons.length > 0 ? articleReasons : ["See Judgment V2 audit panel for full breakdown"],
    performanceReasons:
      performanceReasons.length > 0
        ? performanceReasons
        : j.missingOrUncertain.slice(0, 2).map((m) => `Uncertain: ${m}`),
    checklist,
    confidence: confNum,
    nextStep:
      j.grade === "go"
        ? "If you act, use your own plan and risk limits — this is not a recommendation."
        : j.grade === "skip"
          ? "Protect capital. Log the skip if useful for your review."
          : "Wait for confirmation or clearer evidence. Re-check source filing.",
    judgmentVersion: j.version,
    judgmentV2: j,
  };
}
