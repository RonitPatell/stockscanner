export interface AIAnalysisResult {
  summary: string;
  sentimentScore: number;
  sentimentLabel: string;
  catalystType: string;
  urgencyScore: number;
  keyPoints: string[];
}

const BULLISH_PHRASES: [string, number][] = [
  ["fda approval", 85], ["fast track", 75], ["beats estimates", 70], ["beat estimates", 70],
  ["raised guidance", 65], ["raises guidance", 65], ["price target raised", 55],
  ["record revenue", 55], ["record earnings", 60], ["record profit", 55],
  ["wins contract", 60], ["awarded contract", 58], ["partnership", 45],
  ["strategic partnership", 50], ["acquisition of", 40], ["to acquire", 38],
  ["buyback", 42], ["share repurchase", 40], ["dividend increase", 38],
  ["breakthrough", 70], ["approval granted", 80], ["positive trial", 75],
  ["positive results", 65], ["exceeds expectations", 62], ["above expectations", 58],
  ["strong demand", 50], ["revenue growth", 48], ["profit growth", 52],
  ["expands into", 35], ["launches new", 40], ["unveils", 35],
  ["upgraded to", 50], ["outperform", 42], ["initiated with buy", 48],
  ["price target upgrade", 52], ["all-time high", 45], ["raises forecast", 55],
  ["completes acquisition", 42], ["closes acquisition", 40], ["merger agreement", 35],
  ["licensing deal", 45], ["patent granted", 55], ["cleared by fda", 75],
  ["fda clears", 72], ["phase 3 success", 78], ["top-line results", 50],
  ["stock rises", 30], ["shares rise", 28], ["shares jump", 35], ["shares surge", 42],
  ["soars", 50], ["rallies", 40], ["jumps", 38], ["gains", 25],
];

const BEARISH_PHRASES: [string, number][] = [
  ["fda rejection", -85], ["trial failure", -80], ["failed trial", -78],
  ["misses estimates", -70], ["miss estimates", -70], ["missed estimates", -68],
  ["lowered guidance", -65], ["lowers guidance", -65], ["cuts guidance", -62],
  ["downgrade", -55], ["downgraded to", -52], ["price target cut", -55],
  ["price target lowered", -52], ["secondary offering", -60], ["public offering", -55],
  ["dilution", -55], ["bankruptcy", -90], ["chapter 11", -88],
  ["fraud", -80], ["investigation", -50], ["sec investigation", -58],
  ["lawsuit", -45], ["class action", -48], ["recall", -60],
  ["layoffs", -42], ["workforce reduction", -40], ["plunges", -55],
  ["tumbles", -50], ["crashes", -65], ["stock falls", -35], ["shares fall", -32],
  ["shares drop", -35], ["declines", -28], ["warns", -45], ["warning", -40],
  ["sec probe", -55], ["delisting", -75], ["going concern", -70],
  ["short report", -55], ["halts", -50], ["trading halt", -52],
  ["ceo resigns", -38], ["cfo resigns", -35], ["terminated", -40],
  ["discontinues", -45], ["suspends", -42], ["cuts dividend", -48],
  ["restructuring", -30], ["impairment", -38], ["write-down", -35],
  ["below expectations", -55], ["disappointing", -48], ["weak demand", -40],
];

const BULLISH_WORDS: [RegExp, number][] = [
  [/\b(beat|beats|surge|soar|jump|rally|gain|gains|rise|risen|rose)\b/i, 22],
  [/\b(upgrade|upgraded|outperform|buy rating|overweight)\b/i, 28],
  [/\b(acquire|acquires|acquired|acquisition|merger|buyout)\b/i, 25],
  [/\b(approve|approved|approval|clearance|cleared)\b/i, 30],
  [/\b(contract|awarded|wins|winning|deal|agreement)\b/i, 18],
  [/\b(growth|profit|profitable|revenue|expansion|expand)\b/i, 15],
  [/\b(partnership|collaborat|licensing|breakthrough)\b/i, 20],
  [/\b(repurchase|buyback|dividend hike)\b/i, 22],
];

const BEARISH_WORDS: [RegExp, number][] = [
  [/\b(miss|misses|missed|disappoint|weak|decline|declines|drop|drops|fall|falls)\b/i, -22],
  [/\b(downgrade|downgraded|underperform|sell rating|underweight)\b/i, -28],
  [/\b(bankrupt|chapter 11|delist|delisting|fraud|probe|investigation)\b/i, -45],
  [/\b(layoff|layoffs|restructur|impairment|write-down|writeoff)\b/i, -30],
  [/\b(offering|dilut|secondary offering|shelf registration)\b/i, -35],
  [/\b(lawsuit|litigation|subpoena|recall|halt|suspended)\b/i, -32],
  [/\b(resign|resigns|resigned|terminated|fired|ousted)\b/i, -25],
  [/\b(warn|warning|cut guidance|lower guidance)\b/i, -30],
];

const CATALYST_PATTERNS: [RegExp, string][] = [
  [/\b(fda|phase [123]|clinical trial|biotech|drug|therapeutic)\b/i, "fda"],
  [/\b(earnings|revenue|eps|quarterly|q[1-4]|fiscal year)\b/i, "earnings"],
  [/\b(merger|acquisition|acquire|buyout|takeover|to buy)\b/i, "merger"],
  [/\b(upgrade|raised target|outperform|price target raised)\b/i, "upgrade"],
  [/\b(downgrade|cut target|underperform|price target cut|lowered target)\b/i, "downgrade"],
  [/\b(insider|ceo buy|director buy|form 4)\b/i, "insider"],
  [/\b(8-k|8k|10-k|10-q|sec filing|s-1|form 8)\b/i, "sec_filing"],
  [/\b(contract|awarded|deal worth|agreement signed)\b/i, "contract"],
  [/\b(offering|dilution|secondary|shelf|atm offering)\b/i, "offering"],
  [/\b(ipo|initial public offering|direct listing)\b/i, "offering"],
  [/\b(guidance|outlook|forecast)\b/i, "earnings"],
];

const CATALYST_BASELINE: Record<string, number> = {
  fda: 15,
  earnings: 5,
  merger: 28,
  upgrade: 35,
  downgrade: -35,
  insider: 12,
  sec_filing: 0,
  contract: 30,
  offering: -32,
  macro: 0,
  other: 0,
};

export async function analyzeNews(
  symbol: string,
  headline: string,
  source: string,
  extraContext?: string,
  market?: {
    changePercent?: number | null;
    rVol?: number | null;
    floatShares?: number | null;
    historicalAvgMove?: number | null;
  }
): Promise<AIAnalysisResult> {
  const text = `${headline} ${extraContext || ""}`.toLowerCase();
  let score = 0;
  const matchedBullish: string[] = [];
  const matchedBearish: string[] = [];

  for (const [phrase, pts] of BULLISH_PHRASES) {
    if (text.includes(phrase)) {
      score += pts;
      matchedBullish.push(phrase);
    }
  }
  for (const [phrase, pts] of BEARISH_PHRASES) {
    if (text.includes(phrase)) {
      score += pts;
      matchedBearish.push(phrase);
    }
  }

  for (const [pattern, pts] of BULLISH_WORDS) {
    if (pattern.test(text)) {
      score += pts;
      matchedBullish.push(pattern.source.replace(/\\b/g, ""));
    }
  }
  for (const [pattern, pts] of BEARISH_WORDS) {
    if (pattern.test(text)) {
      score += pts;
      matchedBearish.push(pattern.source.replace(/\\b/g, ""));
    }
  }

  let catalystType = "other";
  for (const [pattern, type] of CATALYST_PATTERNS) {
    if (pattern.test(text)) {
      catalystType = type;
      break;
    }
  }

  if (source === "SEC EDGAR" || /\b8-k\b/i.test(text)) {
    const capitalForm =
      catalystType === "offering" ||
      /\b(424\s*b\s*5|424b5|form\s*s-1|form\s*s-3|s-1\/a|s-3\/a|prospectus\s+supplement|shelf\s+registration|registered\s+direct|at[\s-]?the[\s-]?market|equity\s+purchase|convertible\s+(note|preferred)|warrant\s+reprice|reverse\s+split)\b/i.test(
        text
      );
    catalystType = capitalForm ? "offering" : "sec_filing";
    score += scoreSecFiling(text);
  }

  const keywordScore = score;
  const baseline = CATALYST_BASELINE[catalystType] ?? 0;
  if (Math.abs(keywordScore) < 15) {
    score += baseline;
  } else {
    score += Math.sign(baseline) * Math.min(Math.abs(baseline), 12);
  }

  // Soft-adjust sentiment when the tape already contradicts a "chase"
  const move = market?.changePercent;
  if (move != null && Math.abs(move) >= 20 && score > 20) {
    score -= 12;
    matchedBearish.push("already extended on tape");
  }
  if (market?.rVol != null && market.rVol >= 3 && score > 0) {
    score += 4;
    matchedBullish.push("elevated relative volume");
  }

  score = clamp(score, -100, 100);

  const urgencyScore = computeUrgency(score, catalystType, headline);
  const summary = buildSummary(
    symbol,
    headline,
    catalystType,
    score,
    matchedBullish,
    matchedBearish,
    market
  );
  const keyPoints = buildKeyPoints(
    symbol,
    catalystType,
    score,
    matchedBullish,
    matchedBearish,
    market
  );

  return {
    summary,
    sentimentScore: score,
    sentimentLabel: scoreToLabel(score),
    catalystType,
    urgencyScore,
    keyPoints,
  };
}

function scoreSecFiling(text: string): number {
  if (/\b(bankruptcy|chapter 11|going concern|delist)\b/i.test(text)) return -55;
  if (/\b(acquisition|merger|acquire|buyout)\b/i.test(text)) return 30;
  if (/\b(ceo|cfo|director).{0,20}(resign|appoint|named)\b/i.test(text)) return -8;
  if (/\b(terminate|termination|default|breach)\b/i.test(text)) return -35;
  if (/\b(agreement|contract|partnership|license)\b/i.test(text)) return 22;
  if (/\b(offering|dilution|atm program)\b/i.test(text)) return -30;
  return 5;
}

function computeUrgency(score: number, type: string, headline: string): number {
  let urgency = 50;
  const highUrgencyTypes = ["fda", "earnings", "merger", "offering", "sec_filing"];
  if (highUrgencyTypes.includes(type)) urgency += 20;
  if (Math.abs(score) >= 60) urgency += 15;
  if (Math.abs(score) >= 30) urgency += 8;
  if (/\b(breaking|just in|alert|halt|suspended|material)\b/i.test(headline)) urgency += 15;
  return clamp(urgency, 0, 100);
}

function buildSummary(
  symbol: string,
  headline: string,
  type: string,
  score: number,
  bullish: string[],
  bearish: string[],
  market?: {
    changePercent?: number | null;
    rVol?: number | null;
    floatShares?: number | null;
    historicalAvgMove?: number | null;
  }
): string {
  const tone =
    score >= 30
      ? "potentially positive"
      : score <= -30
        ? "potentially negative"
        : score >= 10
          ? "slightly positive"
          : score <= -10
            ? "slightly negative"
            : "neutral";
  const typeLabel = type.replace("_", " ");
  let summary = `${symbol}: ${headline}`;
  summary += ` This ${typeLabel} catalyst reads ${tone} (sentiment ${score > 0 ? "+" : ""}${score})`;
  if (bullish.length > 0) summary += ` — bullish: ${uniqueSignals(bullish).slice(0, 3).join(", ")}`;
  if (bearish.length > 0) summary += ` — bearish: ${uniqueSignals(bearish).slice(0, 3).join(", ")}`;
  if (market?.changePercent != null) {
    summary += ` · stock ${market.changePercent >= 0 ? "+" : ""}${market.changePercent.toFixed(1)}% today`;
  }
  if (market?.rVol != null && market.rVol > 0) {
    summary += ` · RVol ${market.rVol.toFixed(1)}×`;
  }
  if (market?.historicalAvgMove != null) {
    summary += ` · hist avg move ~${market.historicalAvgMove.toFixed(1)}%`;
  }
  summary += ". Informational only — not investment advice.";
  return summary;
}

function buildKeyPoints(
  symbol: string,
  type: string,
  score: number,
  bullish: string[],
  bearish: string[],
  market?: {
    changePercent?: number | null;
    rVol?: number | null;
    floatShares?: number | null;
    historicalAvgMove?: number | null;
  }
): string[] {
  const points: string[] = [];
  points.push(`${symbol} — ${type.replace("_", " ")} catalyst`);
  if (bullish.length > 0) points.push(`Bullish signals: ${uniqueSignals(bullish).slice(0, 4).join(", ")}`);
  if (bearish.length > 0) points.push(`Bearish signals: ${uniqueSignals(bearish).slice(0, 4).join(", ")}`);
  points.push(`Sentiment score: ${score}/100`);
  if (market?.changePercent != null) {
    points.push(`Today's move: ${market.changePercent >= 0 ? "+" : ""}${market.changePercent.toFixed(1)}%`);
  }
  if (market?.rVol != null && market.rVol > 0) {
    points.push(`Relative volume: ${market.rVol.toFixed(1)}×`);
  }
  if (market?.floatShares != null && market.floatShares > 0) {
    points.push(`Float: ${(market.floatShares / 1e6).toFixed(1)}M shares`);
  }
  if (market?.historicalAvgMove != null) {
    points.push(`Historical avg move for similar news: ${market.historicalAvgMove.toFixed(1)}%`);
  }
  return points;
}

function uniqueSignals(signals: string[]): string[] {
  return [...new Set(signals.map((s) => s.replace(/\\b|\(|\)|\|/g, "").trim()).filter(Boolean))];
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
