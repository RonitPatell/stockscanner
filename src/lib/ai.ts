export interface AIAnalysisResult {
  summary: string;
  sentimentScore: number;
  sentimentLabel: string;
  catalystType: string;
  urgencyScore: number;
  keyPoints: string[];
}

const BULLISH_KEYWORDS: [string, number][] = [
  ["fda approval", 85], ["fast track", 75], ["beats estimates", 70], ["beat estimates", 70],
  ["raised guidance", 65], ["upgrade", 55], ["price target raised", 55], ["surge", 50],
  ["record revenue", 50], ["wins contract", 60], ["partnership", 45], ["acquisition", 40],
  ["buyback", 40], ["dividend increase", 35], ["breakthrough", 70], ["approval granted", 80],
  ["positive trial", 75], ["efficacy", 65], ["beats", 50], ["soars", 55], ["jumps", 50],
  ["rally", 45], ["bullish", 40], ["outperform", 45], ["strong demand", 50],
];

const BEARISH_KEYWORDS: [string, number][] = [
  ["fda rejection", -85], ["trial failure", -80], ["misses estimates", -70], ["miss estimates", -70],
  ["lowered guidance", -65], ["downgrade", -55], ["price target cut", -55], ["secondary offering", -60],
  ["dilution", -55], ["bankruptcy", -90], ["fraud", -80], ["investigation", -50],
  ["lawsuit", -45], ["recall", -60], ["layoffs", -40], ["misses", -60], ["plunges", -55],
  ["tumbles", -50], ["crash", -65], ["bearish", -40], ["underperform", -45], ["warning", -40],
  ["sec probe", -55], ["delisting", -75], ["offering", -50], ["short report", -55],
];

const CATALYST_PATTERNS: [RegExp, string][] = [
  [/\b(fda|phase [123]|clinical trial|biotech|drug)\b/i, "fda"],
  [/\b(earnings|revenue|eps|quarterly|q[1-4])\b/i, "earnings"],
  [/\b(merger|acquisition|acquire|buyout|takeover)\b/i, "merger"],
  [/\b(upgrade|raised target|outperform)\b/i, "upgrade"],
  [/\b(downgrade|cut target|underperform)\b/i, "downgrade"],
  [/\b(insider|ceo buy|director buy|form 4)\b/i, "insider"],
  [/\b(8-k|10-k|10-q|sec filing|s-1)\b/i, "sec_filing"],
  [/\b(fed|inflation|jobs report|gdp|interest rate)\b/i, "macro"],
  [/\b(contract|awarded|deal worth|agreement)\b/i, "contract"],
  [/\b(offering|dilution|secondary|shelf)\b/i, "offering"],
];

export async function analyzeNews(
  symbol: string,
  headline: string,
  source: string,
  extraContext?: string
): Promise<AIAnalysisResult> {
  const text = `${headline} ${extraContext || ""}`.toLowerCase();
  let score = 0;
  const matchedBullish: string[] = [];
  const matchedBearish: string[] = [];

  for (const [kw, pts] of BULLISH_KEYWORDS) {
    if (text.includes(kw)) {
      score += pts;
      matchedBullish.push(kw);
    }
  }
  for (const [kw, pts] of BEARISH_KEYWORDS) {
    if (text.includes(kw)) {
      score += pts;
      matchedBearish.push(kw);
    }
  }

  score = clamp(score, -100, 100);

  let catalystType = "other";
  for (const [pattern, type] of CATALYST_PATTERNS) {
    if (pattern.test(text)) {
      catalystType = type;
      break;
    }
  }

  const urgencyScore = computeUrgency(score, catalystType, headline);
  const summary = buildSummary(symbol, headline, catalystType, score, matchedBullish, matchedBearish);
  const keyPoints = buildKeyPoints(symbol, catalystType, score, matchedBullish, matchedBearish);

  return {
    summary,
    sentimentScore: score,
    sentimentLabel: scoreToLabel(score),
    catalystType,
    urgencyScore,
    keyPoints,
  };
}

function computeUrgency(score: number, type: string, headline: string): number {
  let urgency = 50;
  const highUrgencyTypes = ["fda", "earnings", "merger", "offering"];
  if (highUrgencyTypes.includes(type)) urgency += 20;
  if (Math.abs(score) >= 60) urgency += 15;
  if (/\b(breaking|just in|alert|halt|suspended)\b/i.test(headline)) urgency += 15;
  return clamp(urgency, 0, 100);
}

function buildSummary(
  symbol: string,
  headline: string,
  type: string,
  score: number,
  bullish: string[],
  bearish: string[]
): string {
  const tone = score >= 30 ? "potentially positive" : score <= -30 ? "potentially negative" : "neutral";
  const typeLabel = type.replace("_", " ");
  let summary = `${symbol}: ${headline}`;
  if (bullish.length > 0 || bearish.length > 0) {
    summary += ` This ${typeLabel} catalyst appears ${tone} based on keyword analysis`;
    if (bullish.length > 0) summary += ` (bullish signals: ${bullish.slice(0, 2).join(", ")})`;
    if (bearish.length > 0) summary += ` (bearish signals: ${bearish.slice(0, 2).join(", ")})`;
    summary += ".";
  }
  summary += " Informational only — not investment advice.";
  return summary;
}

function buildKeyPoints(
  symbol: string,
  type: string,
  score: number,
  bullish: string[],
  bearish: string[]
): string[] {
  const points: string[] = [];
  points.push(`${symbol} — ${type.replace("_", " ")} catalyst detected`);
  if (bullish.length > 0) points.push(`Bullish keywords: ${bullish.slice(0, 3).join(", ")}`);
  if (bearish.length > 0) points.push(`Bearish keywords: ${bearish.slice(0, 3).join(", ")}`);
  points.push(`Sentiment indicator: ${score}/100 (informational only)`);
  return points;
}

function scoreToLabel(score: number): string {
  if (score >= 60) return "very_bullish";
  if (score >= 20) return "bullish";
  if (score <= -60) return "very_bearish";
  if (score <= -20) return "bearish";
  return "neutral";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
