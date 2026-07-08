import { TICKER_BLACKLIST, isValidTickerFormat } from "./ticker-utils";
import { fetchQuote } from "./market-data";

/** Tickers that are valid symbols but commonly mean something else in news */
const CONTEXT_FALSE_POSITIVES: { symbol: string; pattern: RegExp }[] = [
  { symbol: "ICE", pattern: /\bICE\s+(agents?|officers?|immigration|enforcement|raids?|detention|deportation)/i },
  { symbol: "ICE", pattern: /\b(immigration|customs)\s+(and\s+)?enforcement\b/i },
  { symbol: "US", pattern: /\b(?:in|the|across)\s+(the\s+)?US\b/i },
  { symbol: "US", pattern: /\bUS\s+(economy|government|senate|congress|dollar|markets?|stocks?|treasury|jobs?)/i },
  { symbol: "CAN", pattern: /\b(?:you|we|they|who)\s+can\b/i },
  { symbol: "ON", pattern: /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i },
  { symbol: "FOR", pattern: /\bfor\s+(the|a|an)\b/i },
  { symbol: "ALL", pattern: /\ball\s+(of\s+)?(the|these|those)\b/i },
  { symbol: "NEW", pattern: /\bnew\s+(york|jersey|hampshire|mexico|orleans|delhi)\b/i },
  { symbol: "TV", pattern: /\b(?:on|watch|live)\s+tv\b/i },
];

const STOCK_CONTEXT =
  /\b(stock|shares?|ticker|nasdaq|nyse|amex|earnings|revenue|eps|guidance|ipo|offering|fda|merger|acquisition|upgrade|downgrade|price target|market cap|float|trading|premarket|after.?hours|sec filing|8-k|10-k|quarter|dividend|buyback|analyst)\b/i;

const COMPANY_SUFFIX = /\b(inc\.?|corp\.?|corporation|ltd\.?|llc|plc|holdings?|group|company)\b/i;

export interface VerifiedTicker {
  symbol: string;
  confidence: number;
  method: string;
}

export interface VerifyResult {
  valid: boolean;
  symbol: string;
  confidence: number;
  reason?: string;
}

function normalizeText(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

function isFalsePositive(symbol: string, text: string): boolean {
  if (TICKER_BLACKLIST.has(symbol)) return true;
  for (const fp of CONTEXT_FALSE_POSITIVES) {
    if (fp.symbol === symbol && fp.pattern.test(text)) return true;
  }
  return false;
}

export function isKnownFalsePositive(symbol: string, headline: string, summary?: string): boolean {
  return isFalsePositive(symbol, normalizeText(headline, summary));
}

/** Extract all ticker candidates from text */
export function extractTickerCandidates(headline: string, summary?: string): string[] {
  const text = normalizeText(headline, summary);
  const found = new Set<string>();

  for (const m of text.matchAll(/\((?:NASDAQ|NYSE|AMEX|OTC)[:\s]+([A-Z]{1,5})\)/gi)) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  const parenTicker = text.match(/\(([A-Z]{1,5})\)/);
  if (parenTicker?.[1] && isValidTickerFormat(parenTicker[1])) {
    found.add(parenTicker[1]);
  }

  const startMatch = text.match(/^([A-Z]{1,5})\b/);
  if (startMatch?.[1] && isValidTickerFormat(startMatch[1])) {
    found.add(startMatch[1]);
  }

  const colonMatch = text.match(/^([A-Z]{1,5}):/);
  if (colonMatch?.[1] && isValidTickerFormat(colonMatch[1])) {
    found.add(colonMatch[1]);
  }

  return [...found];
}

function scoreCandidate(symbol: string, headline: string, summary?: string): number {
  const text = normalizeText(headline, summary);
  let score = 0;

  if (isFalsePositive(symbol, text)) return -100;

  if (new RegExp(`\\$${symbol}\\b`).test(text)) score += 50;
  if (new RegExp(`\\((?:NASDAQ|NYSE|AMEX|OTC)[:\\s]+${symbol}\\)`, "i").test(text)) score += 45;
  if (new RegExp(`\\b${symbol}\\s+(stock|shares?)\\b`, "i").test(text)) score += 40;
  if (text.match(new RegExp(`^${symbol}\\b`))) score += 25;
  if (STOCK_CONTEXT.test(text)) score += 15;
  if (COMPANY_SUFFIX.test(text)) score += 10;

  if (symbol.length <= 2 && !text.includes(`$${symbol}`)) score -= 30;

  return score;
}

export function resolveArticleSymbol(
  headline: string,
  summary?: string,
  finnhubRelated?: string
): VerifiedTicker | null {
  const text = normalizeText(headline, summary);
  const candidates = new Set(extractTickerCandidates(headline, summary));

  if (finnhubRelated) {
    for (const s of finnhubRelated.split(",")) {
      const sym = s.trim().toUpperCase();
      if (isValidTickerFormat(sym)) candidates.add(sym);
    }
  }

  if (candidates.size === 0) return null;

  let best: VerifiedTicker | null = null;
  for (const symbol of candidates) {
    const score = scoreCandidate(symbol, headline, summary);
    if (score < 10) continue;
    if (!best || score > best.confidence) {
      best = { symbol, confidence: score, method: "headline_parse" };
    }
  }

  if (!best) return null;
  if (isFalsePositive(best.symbol, text)) return null;

  return best;
}

const quoteValidated = new Map<string, { valid: boolean; ts: number }>();
const QUOTE_CACHE_MS = 10 * 60 * 1000;

export async function verifyNewsArticle(
  headline: string,
  summary?: string,
  finnhubRelated?: string,
  preferredSymbol?: string
): Promise<VerifyResult> {
  const resolved = resolveArticleSymbol(headline, summary, finnhubRelated);

  if (!resolved && preferredSymbol) {
    const score = scoreCandidate(preferredSymbol, headline, summary);
    if (score >= 10 && !isFalsePositive(preferredSymbol, normalizeText(headline, summary))) {
      return validateWithQuote(preferredSymbol, score);
    }
    return { valid: false, symbol: preferredSymbol, confidence: 0, reason: "symbol_not_in_article" };
  }

  if (!resolved) {
    return { valid: false, symbol: "", confidence: 0, reason: "no_ticker_found" };
  }

  if (preferredSymbol && preferredSymbol !== resolved.symbol) {
    const prefScore = scoreCandidate(preferredSymbol, headline, summary);
    if (prefScore > resolved.confidence) {
      return validateWithQuote(preferredSymbol, prefScore);
    }
  }

  return validateWithQuote(resolved.symbol, resolved.confidence);
}

async function validateWithQuote(symbol: string, confidence: number): Promise<VerifyResult> {
  if (!isValidTickerFormat(symbol)) {
    return { valid: false, symbol, confidence: 0, reason: "invalid_format" };
  }

  const cached = quoteValidated.get(symbol);
  if (cached && Date.now() - cached.ts < QUOTE_CACHE_MS) {
    if (!cached.valid) {
      return { valid: false, symbol, confidence: 0, reason: "not_tradeable" };
    }
    return { valid: true, symbol, confidence };
  }

  if (!process.env.FINNHUB_API_KEY) {
    return confidence >= 25
      ? { valid: true, symbol, confidence }
      : { valid: false, symbol, confidence: 0, reason: "low_confidence" };
  }

  const quote = await fetchQuote(symbol);
  const valid = quote != null && quote.price > 0;
  quoteValidated.set(symbol, { valid, ts: Date.now() });

  if (!valid) {
    return { valid: false, symbol, confidence: 0, reason: "not_tradeable" };
  }

  return { valid: true, symbol, confidence };
}
