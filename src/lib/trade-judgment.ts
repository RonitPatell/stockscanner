import type { CatalystItem } from "@/types";
import { isDilutionCatalyst } from "./action-playbook";
import { buildJudgmentV2, judgmentV2ToTradeJudgment } from "./judgment/build-v2";
import { presentJudgment } from "./judgment/present";
import { isJudgmentV2Enabled, type JudgmentV2 } from "./judgment/types";

/** Trader-facing grade — kept for API/DB compatibility; not primary UI. */
export type TradeGrade = "go" | "watch" | "skip";

export interface ChecklistItem {
  id: string;
  label: string;
  pass: boolean;
  /** Plain English why this gate matters */
  tip: string;
}

export interface TradeJudgment {
  grade: TradeGrade;
  /** Presentation primary label (materiality) — never GO/LONG/SHORT as sole meaning */
  label: string;
  /** One-line plain English for the row */
  summary: string;
  /** Longer explanation when expanded */
  explanation: string;
  /** Article-side reasons */
  articleReasons: string[];
  /** Company / tape performance reasons */
  performanceReasons: string[];
  checklist: ChecklistItem[];
  /** 0–100 confidence in this grade (not a win-rate promise) */
  confidence: number;
  /** Suggested next step */
  nextStep: string;
  /** Present when Judgment V2 produced this grade */
  judgmentVersion?: string;
  judgmentV2?: JudgmentV2;
}

const BULL_TYPES = new Set([
  "fda",
  "contract",
  "earnings",
  "upgrade",
  "partnership",
  "buyback",
  "merger",
]);
const BEAR_TYPES = new Set(["downgrade", "lawsuit", "investigation", "bankruptcy", "offering", "dilution"]);

function floatM(c: Pick<CatalystItem, "floatShares">): number | null {
  if (c.floatShares == null || c.floatShares <= 0) return null;
  return c.floatShares / 1e6;
}

/**
 * Grade a catalyst using BOTH the news story and how the company is trading.
 * Deterministic, explainable — not a black-box AI signal.
 *
 * When JUDGMENT_V2_ENABLED is on, returns a V1-compatible shape backed by Judgment V2.
 */
export function buildTradeJudgment(
  c: Pick<
    CatalystItem,
    | "symbol"
    | "headline"
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
    | "verifiedConfidence"
    | "sourceTier"
    | "source"
    | "sourceUrl"
    | "matchMethod"
    | "publishedAt"
    | "keyPoints"
    | "price"
    | "volume"
    | "avgVolume"
  >
): TradeJudgment {
  if (isJudgmentV2Enabled()) {
    const persisted =
      (c as CatalystItem & { judgmentV2?: JudgmentV2 }).judgmentV2 ?? null;
    const v2 =
      persisted?.version?.startsWith("judgment-v2")
        ? persisted
        : buildJudgmentV2(c, { previous: persisted });
    return judgmentV2ToTradeJudgment(v2);
  }
  return buildTradeJudgmentV1(c);
}

function buildTradeJudgmentV1(
  c: Pick<
    CatalystItem,
    | "symbol"
    | "headline"
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
    | "verifiedConfidence"
    | "sourceTier"
  >
): TradeJudgment {
  const type = (c.catalystType ?? "other").toLowerCase();
  const sentiment = c.sentimentScore ?? 0;
  const move = c.changePercent ?? 0;
  const absMove = Math.abs(move);
  const rVol = c.rVol ?? 0;
  const fM = floatM(c);
  const hist = c.historicalAvgMove;
  const histN = c.historicalSampleSize ?? 0;
  const urgency = c.urgencyScore ?? 0;
  const dilution = isDilutionCatalyst(c);
  const lowFloat = fM != null && fM < 20;
  const heavyVol = rVol >= 3;
  const extended = absMove >= 12;
  const veryExtended = absMove >= 25;
  const wire = c.sourceTier === "wire" || c.sourceTier === "exchange";

  const articleReasons: string[] = [];
  const performanceReasons: string[] = [];

  // ── Article scoring ─────────────────────────────
  let articleScore = 0; // positive = bullish quality, negative = avoid

  if (dilution) {
    articleScore -= 50;
    articleReasons.push("Headline looks like an offering / dilution event");
  } else if (BEAR_TYPES.has(type) && type !== "offering") {
    articleScore -= 25;
    articleReasons.push(`Bearish catalyst type: ${type}`);
  } else if (BULL_TYPES.has(type)) {
    articleScore += 28;
    articleReasons.push(`Constructive catalyst type: ${type}`);
  } else {
    articleReasons.push(`Catalyst type: ${type || "unclear"} — treat as early`);
  }

  if (sentiment >= 40) {
    articleScore += 15;
    articleReasons.push(`News tone is constructive (sentiment ${sentiment.toFixed(0)})`);
  } else if (sentiment <= -40) {
    articleScore -= 15;
    articleReasons.push(`News tone is negative (sentiment ${sentiment.toFixed(0)})`);
  }

  if (wire) {
    articleScore += 8;
    articleReasons.push("Higher-trust source tier (wire / exchange)");
  }

  if ((c.verifiedConfidence ?? 0) >= 70) {
    articleScore += 5;
    articleReasons.push("Ticker–headline match looks solid");
  } else if ((c.verifiedConfidence ?? 100) < 45) {
    articleScore -= 10;
    articleReasons.push("Weak ticker match — double-check this is the right company");
  }

  // ── Company / tape performance ──────────────────
  let tapeScore = 0;

  if (heavyVol) {
    tapeScore += 12;
    performanceReasons.push(`Relative volume is elevated (${rVol.toFixed(1)}×) — market is paying attention`);
  } else if (rVol > 0 && rVol < 1.2) {
    tapeScore -= 8;
    performanceReasons.push("Volume is light vs average — headline may not have real participation");
  }

  if (veryExtended) {
    tapeScore -= 35;
    performanceReasons.push(
      `Already moved ${move >= 0 ? "+" : ""}${move.toFixed(1)}% today — chasing here is usually a red trade`
    );
  } else if (extended) {
    tapeScore -= 18;
    performanceReasons.push(
      `Extended move (${move >= 0 ? "+" : ""}${move.toFixed(1)}%) — wait for a pullback or skip`
    );
  } else if (absMove >= 2 && absMove < 12) {
    tapeScore += 10;
    performanceReasons.push(
      `Stock is reacting (${move >= 0 ? "+" : ""}${move.toFixed(1)}%) without being fully extended`
    );
  } else if (absMove < 1) {
    performanceReasons.push("Price barely moved yet — either early or the market doesn’t care");
  }

  if (lowFloat) {
    performanceReasons.push(`Low float (~${fM!.toFixed(1)}M) — moves fast both ways; size carefully or skip`);
    if (extended) tapeScore -= 8;
  }

  if (hist != null && histN >= 3) {
    if (absMove > Math.abs(hist) * 1.6 && absMove >= 8) {
      tapeScore -= 12;
      performanceReasons.push(
        `Already beyond typical move for this news type (hist ~${hist.toFixed(1)}% on ${histN} samples)`
      );
    } else if (absMove > 0 && absMove < Math.abs(hist) * 0.5) {
      tapeScore += 6;
      performanceReasons.push(
        `Still inside a normal move range for this news type (hist ~${hist.toFixed(1)}%)`
      );
    } else {
      performanceReasons.push(
        `Similar headlines historically averaged ~${hist.toFixed(1)}% (n=${histN})`
      );
    }
  }

  if (urgency >= 60 && !dilution && !veryExtended) {
    tapeScore += 5;
    performanceReasons.push("Urgency is elevated — story is fresh");
  }

  // ── Checklist ───────────────────────────────────
  const checklist: ChecklistItem[] = [
    {
      id: "not-dilution",
      label: "Not an offering / dilution trap",
      pass: !dilution,
      tip: "Offerings often spike then sell off. Skipping these protects capital.",
    },
    {
      id: "not-extended",
      label: "Not already extended (>12% without a plan)",
      pass: !extended || dilution, // if dilution, this gate is moot; skip wins
      tip: "Big green candles after news are where late buyers get trapped.",
    },
    {
      id: "has-participation",
      label: "Volume confirms interest (RVol ≥ 1.5 or unknown)",
      pass: rVol === 0 || rVol >= 1.5,
      tip: "No volume = headline without buyers. Wait or skip.",
    },
    {
      id: "clear-story",
      label: "Story type is clear (not vague PR)",
      pass: type !== "other" && type !== "macro",
      tip: "Vague press releases rarely make clean trades.",
    },
    {
      id: "ticker-match",
      label: "Ticker matches the headline",
      pass: (c.verifiedConfidence ?? 60) >= 45,
      tip: "Wrong ticker = guaranteed confusion. Verify before risking money.",
    },
  ];

  const checksPassed = checklist.filter((x) => x.pass).length;
  const hardFails = !checklist.find((x) => x.id === "not-dilution")!.pass;

  // ── Final grade (stored) + presentation (display) ─
  const combined = articleScore + tapeScore;
  let grade: TradeGrade;
  let nextStep: string;
  let confidence: number;

  if (hardFails || dilution || (veryExtended && sentiment < 50)) {
    grade = "skip";
    nextStep =
      "Log as skipped. Review evidence before risking capital on the spike.";
    confidence = Math.min(95, 70 + (dilution ? 15 : 0) + (veryExtended ? 10 : 0));
  } else if (
    combined >= 35 &&
    checksPassed >= 4 &&
    (BULL_TYPES.has(type) || sentiment >= 35) &&
    !extended &&
    (heavyVol || absMove >= 2 || urgency >= 45)
  ) {
    grade = "go";
    nextStep =
      "Review levels and evidence. This is not a buy instruction or guarantee.";
    confidence = Math.min(88, 55 + checksPassed / 3 + (heavyVol ? 8 : 0));
  } else if (combined <= -20 || checksPassed <= 2) {
    grade = "skip";
    nextStep = "Wait for a cleaner setup or move on.";
    confidence = Math.min(85, 50 + Math.abs(combined) / 2);
  } else {
    grade = "watch";
    nextStep =
      "Set an alert or watchlist. Re-check after a pullback or fresh confirmation.";
    confidence = Math.min(75, 40 + checksPassed * 6);
  }

  const presented = presentJudgment({
    catalystStrength:
      grade === "go"
        ? "STRONG"
        : grade === "skip" && dilution
          ? "MODERATE"
          : grade === "skip"
            ? "WEAK"
            : "MODERATE",
    directionalImplication:
      BEAR_TYPES.has(type) || sentiment <= -20
        ? "NEGATIVE"
        : BULL_TYPES.has(type) || sentiment >= 20
          ? "POSITIVE"
          : "UNCLEAR",
    tradeability: "ACCEPTABLE",
    dilutionHint: dilution,
    legacyGrade: grade,
  });

  const explanation = [
    "Judgment dimensions separate materiality (attention) from directional implication (catalyst tone).",
    "Legacy GO/WATCH/SKIP values remain for compatibility and are not buy/sell instructions.",
    "This uses the headline/catalyst analysis plus how the company is performing today (move %, relative volume, float, and history when available). It is a decision aid — not financial advice.",
  ].join(" ");

  return {
    grade,
    label: presented.materiality,
    summary: presented.dimensionsLine,
    explanation,
    articleReasons: articleReasons.slice(0, 4),
    performanceReasons: performanceReasons.slice(0, 4),
    checklist,
    confidence: Math.round(confidence),
    nextStep,
  };
}

export function gradeClass(grade: TradeGrade): string {
  switch (grade) {
    case "go":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
    case "skip":
      return "bg-amber-500/15 text-amber-200 border-amber-500/40";
    default:
      return "bg-zinc-800/80 text-zinc-300 border-zinc-600/50";
  }
}

export function gradeDotClass(grade: TradeGrade): string {
  switch (grade) {
    case "go":
      return "bg-emerald-400";
    case "skip":
      return "bg-amber-400";
    default:
      return "bg-zinc-500";
  }
}
