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
  { symbol: "DOW", pattern: /\bdow\s+jones\b/i },
  { symbol: "SPX", pattern: /\bs&?p\s*500\b/i },
  // Ultragenyx (RARE) vs food/lifestyle copy that is not the company
  { symbol: "RARE", pattern: /\brare\s+(steak|burger|beef|meat|wagyu|ribeye|sirloin|cook|medium)\b/i },
  { symbol: "RARE", pattern: /\b(steak|wagyu|ribeye)\s+championship\b/i },
  { symbol: "EAT", pattern: /\b(let'?s\s+)?eat\b/i },
  { symbol: "FAST", pattern: /\bfast\s+(food|casual)\b/i },
  { symbol: "CAKE", pattern: /\b(birth)?day\s+cake\b|\bcake\s+(recipe|mix|baker)/i },
  { symbol: "COOK", pattern: /\b(home)?\s*cook(ing|ed|book)?\b/i },
  { symbol: "FISH", pattern: /\bfish(ing)?\s+(tournament|trip|season)\b/i },
  { symbol: "PLAY", pattern: /\b(fair|foul)\s+play\b|\bplay\s+(offs?|ground)\b/i },
  { symbol: "GAME", pattern: /\b(video\s+)?game\s+(night|show|console)\b/i },
  { symbol: "LIFE", pattern: /\blife\s+(hack|style|coach)\b/i },
  { symbol: "HOPE", pattern: /\bhope\s+(for|to|that)\b/i },
  { symbol: "REAL", pattern: /\breal\s+(estate|house|life)\b/i },
];

const STOCK_CONTEXT =
  /\b(stock|shares?|ticker|nasdaq|nyse|amex|earnings|revenue|eps|guidance|ipo|offering|fda|merger|acquisition|upgrade|downgrade|price target|market cap|float|trading|premarket|after.?hours|sec filing|8-k|10-k|10-q|quarter|dividend|buyback|analyst|session|movers?|rally|sell.?off|gainers?|losers?|shareholder|investors?|class action|lawsuit|securities|valuation|profit|loss|outlook|beat|miss|guidance|fintech|biotech|pharma)\b/i;

const COMPANY_SUFFIX =
  /\b(inc\.?|corp\.?|corporation|ltd\.?|llc|plc|holdings?|group|company|technologies|pharmaceuticals?|therapeutics)\b/i;

/** Lifestyle / food / sports / PR fluff that is not equity news */
const NON_STOCK_LANGUAGE =
  /\b(steak|wagyu|ribeye|sirloin|burger|bbq|barbecue|cookbook|recipe|restaurant\s+opening|food\s+festival|culinary|championship\s+expands|cooking\s+competition|beauty\s+pageant|fashion\s+week|red\s+carpet|box\s+office|movie\s+review|concert\s+tour|album\s+release|sports\s+score|box\s+score|weather\s+forecast|horoscope|crossword|sudoku|travel\s+tips|wedding|obituary)\b/i;

/** Explicit equity markers that override lifestyle heuristics */
const EXPLICIT_EQUITY_MARKER =
  /(\$[A-Z]{1,5}\b|\((?:NASDAQ|NYSE|AMEX|OTC|NYSE American|Nasdaq)[:\s]+[A-Z]{1,5}\)|(?:NASDAQ|NYSE|AMEX|OTC):\s*[A-Z]{1,5}\b|\([A-Z]{2,5}\)|\b(stock|shares?|nasdaq|nyse|earnings|investor|shareholder|sec\s+filing|8-k|class action)\b)/i;

/** Market-roundup language — article likely names several stocks */
const ROUNDUP_LANGUAGE =
  /\b(today'?s?\s+session|stocks?\s+to\s+watch|market\s+(movers?|wrap|recap|update)|what'?s\s+going\s+on|stocks?\s+(moving|surging|falling|rallying)|dow\s+jones|s&?p\s*500|nasdaq\s+composite|biggest\s+(gainers?|losers?|movers?)|top\s+(gainers?|losers?|movers?)|here'?s\s+what|stocks?\s+in\s+(focus|play)|names?\s+to\s+watch|morning\s+(movers?|wrap)|closing\s+bell|premarket\s+movers?)\b/i;

const INDEX_ETFS = new Set(["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO"]);

/** Private / non-listed names that often appear in misleading "X Stock …" headlines */
const NON_TRADABLE_COMPANY =
  /\b(SpaceX|OpenAI|Anthropic|Stripe|Databricks|ByteDance|Epic\s+Games|Shein)\b/i;

/** Company names that map to a single tradable ticker */
const TICKER_COMPANY_NAMES: Record<string, string[]> = {
  AAPL: ["apple"],
  AMD: ["amd", "advanced micro devices", "advanced micro"],
  AMZN: ["amazon"],
  GOOG: ["google", "alphabet"],
  GOOGL: ["google", "alphabet"],
  LMND: ["lemonade"],
  META: ["meta platforms", "facebook"],
  MRNA: ["moderna"],
  MSFT: ["microsoft"],
  NVDA: ["nvidia"],
  PLTR: ["palantir"],
  SOFI: ["sofi", "sofi technologies"],
  TSLA: ["tesla"],
};

const HEADLINE_LEAD_COMPANY_STOCK =
  /^([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)?)\s+stock\b/i;

function companyNamesForTicker(symbol: string): string[] {
  return TICKER_COMPANY_NAMES[symbol] ?? [];
}

/** Ticker implied by a leading "Company stock …" headline pattern */
export function companyLeadTicker(headline: string): string | null {
  const lead = headline.match(HEADLINE_LEAD_COMPANY_STOCK);
  if (!lead?.[1]) return null;

  const raw = lead[1].trim();
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (isValidTickerFormat(compact)) return compact;

  const lower = raw.toLowerCase();
  for (const [sym, names] of Object.entries(TICKER_COMPANY_NAMES)) {
    if (names.some((n) => lower === n || lower.startsWith(`${n} `) || lower.includes(n))) {
      return sym;
    }
  }
  return null;
}

/**
 * Article must clearly be about this one symbol — no inferred / feed-metadata guesses.
 */
export function articleIsAboutSymbol(
  symbol: string,
  headline: string,
  summary?: string
): boolean {
  if (headlineSubjectConflictsWithSymbol(headline, symbol, summary)) return false;
  if (isRoundupArticle(headline, summary)) return false;

  const text = normalizeText(headline, summary);
  if (hasExplicitTickerForm(symbol, text)) return true;
  if (new RegExp(`\\b${symbol}\\b`).test(headline)) return true;

  const lead = companyLeadTicker(headline);
  if (lead === symbol) return true;

  for (const name of companyNamesForTicker(symbol)) {
    if (new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)) return true;
  }

  return false;
}

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
  method?: string;
  /** Other verified tickers from the same article (roundups) */
  relatedSymbols?: string[];
  isRoundup?: boolean;
}

function normalizeText(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

function hasExplicitTickerForm(symbol: string, text: string): boolean {
  return (
    new RegExp(`\\$${symbol}\\b`).test(text) ||
    new RegExp(`\\(\\s*${symbol}\\s*\\)`).test(text) ||
    new RegExp(`\\((?:NASDAQ|NYSE|AMEX|OTC|NYSE American|Nasdaq)[:\\s]+${symbol}\\)`, "i").test(
      text
    ) ||
    new RegExp(`\\b(?:NASDAQ|NYSE|AMEX|OTC):\\s*${symbol}\\b`, "i").test(text) ||
    new RegExp(`\\b${symbol}\\s+(stock|shares?)\\b`, "i").test(text)
  );
}

function isFalsePositive(symbol: string, text: string): boolean {
  if (TICKER_BLACKLIST.has(symbol)) return true;
  for (const fp of CONTEXT_FALSE_POSITIVES) {
    if (fp.symbol === symbol && fp.pattern.test(text)) return true;
  }
  return false;
}

/**
 * Reject lifestyle/food/sports PR that is not about a listed company.
 * Explicit equity markers ($TICKER, exchange tag, "stock/shares/…") can override.
 */
export function isNonStockArticle(headline: string, summary?: string): boolean {
  const text = normalizeText(headline, summary);
  if (!text.trim()) return true;
  if (EXPLICIT_EQUITY_MARKER.test(text)) return false;
  if (STOCK_CONTEXT.test(text) || ROUNDUP_LANGUAGE.test(text) || COMPANY_SUFFIX.test(text)) {
    return false;
  }
  return NON_STOCK_LANGUAGE.test(text);
}

/** Article must look like market / company news before we attach any ticker */
export function isLikelyStockNews(headline: string, summary?: string): boolean {
  if (isNonStockArticle(headline, summary)) return false;
  const text = normalizeText(headline, summary);
  return (
    EXPLICIT_EQUITY_MARKER.test(text) ||
    STOCK_CONTEXT.test(text) ||
    ROUNDUP_LANGUAGE.test(text) ||
    COMPANY_SUFFIX.test(text)
  );
}

export function isKnownFalsePositive(symbol: string, headline: string, summary?: string): boolean {
  if (isNonStockArticle(headline, summary)) return true;
  if (headlineSubjectConflictsWithSymbol(headline, symbol, summary)) return true;
  return isFalsePositive(symbol, normalizeText(headline, summary));
}

/**
 * Reject assigning a watchlist ticker when the headline is clearly about another
 * subject (e.g. "SpaceX Stock …" tagged as NVDA via Finnhub `related` metadata).
 */
export function headlineSubjectConflictsWithSymbol(
  headline: string,
  symbol: string,
  summary?: string
): boolean {
  const text = normalizeText(headline, summary);
  if (hasExplicitTickerForm(symbol, text)) return false;
  if (new RegExp(`\\b${symbol}\\b`).test(headline)) return false;

  const leadTicker = companyLeadTicker(headline);
  if (leadTicker && leadTicker !== symbol) return true;

  if (NON_TRADABLE_COMPANY.test(text)) return true;

  const lead = headline.match(HEADLINE_LEAD_COMPANY_STOCK);
  if (lead?.[1]) {
    const compact = lead[1].replace(/\s+/g, "").toUpperCase();
    if (compact !== symbol && !isValidTickerFormat(compact)) return true;
  }

  return false;
}

function isNonTradableCompanyStockStory(headline: string, summary?: string): boolean {
  const text = normalizeText(headline, summary);
  if (!NON_TRADABLE_COMPANY.test(text)) return false;
  const explicit = extractTickerCandidates(headline, summary).some((s) =>
    hasExplicitTickerForm(s, text)
  );
  return !explicit;
}

function finnhubRelatedMentionedInCopy(
  symbol: string,
  headline: string,
  summary: string | undefined,
  headlineCandidates: string[]
): boolean {
  const text = normalizeText(headline, summary);
  if (headlineSubjectConflictsWithSymbol(headline, symbol, summary)) return false;
  if (hasExplicitTickerForm(symbol, text) || new RegExp(`\\b${symbol}\\b`).test(headline)) {
    return true;
  }
  return false;
}

export function isRoundupArticle(headline: string, summary?: string): boolean {
  return ROUNDUP_LANGUAGE.test(normalizeText(headline, summary));
}

/** Extract all ticker candidates from text */
export function extractTickerCandidates(headline: string, summary?: string): string[] {
  const text = normalizeText(headline, summary);
  const found = new Set<string>();

  for (const m of text.matchAll(
    /\((?:NASDAQ|NYSE|AMEX|OTC|NYSE American|Nasdaq)[:\s]+([A-Z]{1,5})\)/gi
  )) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  for (const m of text.matchAll(/\b(?:NASDAQ|NYSE|AMEX|OTC):\s*([A-Z]{1,5})\b/gi)) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  for (const m of text.matchAll(/\(([A-Z]{1,5})\)/g)) {
    const sym = m[1].toUpperCase();
    if (isValidTickerFormat(sym)) found.add(sym);
  }

  // Lists like "AAPL, MSFT, and NVDA" only near stock language
  if (STOCK_CONTEXT.test(text) || ROUNDUP_LANGUAGE.test(text)) {
    for (const m of text.matchAll(/\b([A-Z]{2,5})(?:\s*[,/]\s*([A-Z]{2,5})){1,8}\b/g)) {
      const chunk = m[0];
      for (const part of chunk.split(/[\s,/]+/)) {
        const sym = part.toUpperCase();
        if (isValidTickerFormat(sym)) found.add(sym);
      }
    }
  }

  // Leading ALL-CAPS bare word only when the article looks like equity news
  if (isLikelyStockNews(headline, summary)) {
    const startMatch = text.match(/^([A-Z]{1,5})\b/);
    if (startMatch?.[1] && isValidTickerFormat(startMatch[1])) {
      found.add(startMatch[1]);
    }

    const colonMatch = text.match(/^([A-Z]{1,5}):/);
    if (colonMatch?.[1] && isValidTickerFormat(colonMatch[1])) {
      found.add(colonMatch[1]);
    }
  }

  return [...found];
}

function scoreCandidate(symbol: string, headline: string, summary?: string): number {
  const text = normalizeText(headline, summary);
  let score = 0;

  if (isFalsePositive(symbol, text)) return -100;
  if (isNonStockArticle(headline, summary)) return -100;

  if (new RegExp(`\\$${symbol}\\b`).test(text)) score += 50;
  if (new RegExp(`\\((?:NASDAQ|NYSE|AMEX|OTC)[:\\s]+${symbol}\\)`, "i").test(text)) score += 45;
  if (new RegExp(`\\(\\s*${symbol}\\s*\\)`).test(text)) score += 35;
  if (new RegExp(`\\b${symbol}\\s+(stock|shares?)\\b`, "i").test(text)) score += 40;
  if (text.match(new RegExp(`^${symbol}\\b`))) score += 25;
  if (STOCK_CONTEXT.test(text)) score += 15;
  if (COMPANY_SUFFIX.test(text)) score += 10;
  if (ROUNDUP_LANGUAGE.test(text) && new RegExp(`\\b${symbol}\\b`).test(text)) score += 12;

  if (INDEX_ETFS.has(symbol) && !new RegExp(`\\$${symbol}\\b`).test(text)) score -= 15;

  // Bare word without explicit ticker form — require real equity context
  if (!hasExplicitTickerForm(symbol, text)) {
    if (!STOCK_CONTEXT.test(text) && !ROUNDUP_LANGUAGE.test(text) && !COMPANY_SUFFIX.test(text)) {
      score -= 50;
    } else if (!COMPANY_SUFFIX.test(text) && !STOCK_CONTEXT.test(text)) {
      score -= 20;
    }
  }

  return score;
}

/** Best-effort match method label for transparency. */
export function matchMethodForSymbol(
  symbol: string,
  headline: string,
  summary?: string
): string {
  const text = normalizeText(headline, summary);
  if (new RegExp(`\\$${symbol}\\b`).test(text)) return "cashtag";
  if (new RegExp(`\\((?:NASDAQ|NYSE|AMEX|OTC)[:\\s]+${symbol}\\)`, "i").test(text)) {
    return "exchange_tag";
  }
  if (new RegExp(`\\(\\s*${symbol}\\s*\\)`).test(text)) return "paren_ticker";
  if (new RegExp(`\\b${symbol}\\s+(stock|shares?)\\b`, "i").test(text)) return "ticker_stock_phrase";
  if (companyNamesForTicker(symbol).some((n) => new RegExp(`\\b${n}\\b`, "i").test(text))) {
    return "company_name";
  }
  return "headline_parse";
}

export function resolveArticleSymbol(
  headline: string,
  summary?: string,
  finnhubRelated?: string
): VerifiedTicker | null {
  const all = resolveAllArticleSymbols(headline, summary, finnhubRelated);
  return all[0] ?? null;
}

/** Ranked list of ticker candidates that clear the confidence floor */
export function resolveAllArticleSymbols(
  headline: string,
  summary?: string,
  finnhubRelated?: string
): VerifiedTicker[] {
  if (isRoundupArticle(headline, summary)) return [];
  if (isNonTradableCompanyStockStory(headline, summary)) return [];
  if (!isLikelyStockNews(headline, summary) && !finnhubRelated) {
    return [];
  }

  const text = normalizeText(headline, summary);
  const headlineCandidates = extractTickerCandidates(headline, summary);
  const candidates = new Set(headlineCandidates);

  if (finnhubRelated) {
    for (const s of finnhubRelated.split(",")) {
      const sym = s.trim().toUpperCase();
      if (!isValidTickerFormat(sym) || isFalsePositive(sym, text)) continue;
      if (!finnhubRelatedMentionedInCopy(sym, headline, summary, headlineCandidates)) continue;
      candidates.add(sym);
    }
  }

  if (candidates.size === 0) return [];

  const scored: VerifiedTicker[] = [];
  for (const symbol of candidates) {
    if (headlineSubjectConflictsWithSymbol(headline, symbol, summary)) continue;
    const score = scoreCandidate(symbol, headline, summary);
    if (score < 10) continue;
    if (isFalsePositive(symbol, text)) continue;
    scored.push({
      symbol,
      confidence: score,
      method: matchMethodForSymbol(symbol, headline, summary),
    });
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  return scored.filter((t) => {
    if (seen.has(t.symbol)) return false;
    seen.add(t.symbol);
    return true;
  });
}

const quoteValidated = new Map<string, { valid: boolean; ts: number }>();
const QUOTE_CACHE_MS = 10 * 60 * 1000;

export async function verifyNewsArticle(
  headline: string,
  summary?: string,
  finnhubRelated?: string,
  preferredSymbol?: string,
  options: { skipQuoteCheck?: boolean } = {}
): Promise<VerifyResult> {
  if (isNonStockArticle(headline, summary)) {
    return {
      valid: false,
      symbol: preferredSymbol || "",
      confidence: 0,
      reason: "non_stock_article",
    };
  }

  const all = await verifyAllArticleSymbols(
    headline,
    summary,
    finnhubRelated,
    preferredSymbol,
    options
  );

  if (isRoundupArticle(headline, summary)) {
    return {
      valid: false,
      symbol: preferredSymbol || "",
      confidence: 0,
      reason: "roundup",
    };
  }

  const singleStock = all.filter((c) => articleIsAboutSymbol(c.symbol, headline, summary));
  if (singleStock.length === 0) {
    return {
      valid: false,
      symbol: preferredSymbol || "",
      confidence: 0,
      reason: "no_ticker_found",
    };
  }
  if (singleStock.length > 1) {
    return {
      valid: false,
      symbol: preferredSymbol || "",
      confidence: 0,
      reason: "multi_ticker",
    };
  }

  const primary = singleStock[0];
  return {
    valid: true,
    symbol: primary.symbol,
    confidence: primary.confidence,
    method: primary.method,
    relatedSymbols: [],
    isRoundup: false,
  };
}

export async function verifyAllArticleSymbols(
  headline: string,
  summary?: string,
  finnhubRelated?: string,
  preferredSymbol?: string,
  options: { skipQuoteCheck?: boolean } = {}
): Promise<VerifiedTicker[]> {
  if (isNonStockArticle(headline, summary)) return [];

  const skipQuote = options.skipQuoteCheck === true;
  let candidates = resolveAllArticleSymbols(headline, summary, finnhubRelated);
  const text = normalizeText(headline, summary);

  if (preferredSymbol && isValidTickerFormat(preferredSymbol) && !isFalsePositive(preferredSymbol, text)) {
    if (articleIsAboutSymbol(preferredSymbol, headline, summary)) {
      const rawScore = scoreCandidate(preferredSymbol, headline, summary);
      const pref: VerifiedTicker = {
        symbol: preferredSymbol,
        confidence: Math.max(rawScore, 30),
        method: "preferred",
      };
      candidates = [pref, ...candidates.filter((c) => c.symbol !== preferredSymbol)];
    }
  }

  const roundup = isRoundupArticle(headline, summary) || candidates.length >= 2;
  const minScore = roundup ? 8 : 10;

  const filtered = candidates.filter((c) => {
    if (c.confidence < minScore) return false;
    if (roundup && c.confidence < 25 && !hasExplicitTickerForm(c.symbol, text)) {
      return false;
    }
    // Single-name stories without explicit ticker need solid equity language
    if (!hasExplicitTickerForm(c.symbol, text) && !ROUNDUP_LANGUAGE.test(text)) {
      if (!STOCK_CONTEXT.test(text) && !COMPANY_SUFFIX.test(text)) return false;
    }
    return true;
  });

  const verified: VerifiedTicker[] = [];
  for (const c of filtered.slice(0, 12)) {
    if (skipQuote) {
      verified.push(c);
      continue;
    }
    const check = await validateWithQuote(c.symbol, c.confidence);
    if (check.valid) verified.push({ ...c, confidence: check.confidence });
  }

  return verified;
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
