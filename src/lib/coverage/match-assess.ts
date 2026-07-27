import {
  MATCH_PUBLISH_FLOOR,
  MATCH_QUARANTINE_FLOOR,
} from "./types.ts";

export type MatchDisposition = "publish" | "quarantine" | "reject";

export interface MatchAssessment {
  disposition: MatchDisposition;
  confidence: number;
  method: string;
  reason: string;
  ambiguousCashtags: string[];
}

/**
 * Decide publish vs quarantine vs reject from verifier confidence + ambiguity.
 */
export function assessMatchConfidence(input: {
  confidence: number;
  method?: string | null;
  reason?: string | null;
  headline: string;
  summary?: string;
  valid: boolean;
}): MatchAssessment {
  const ambiguousCashtags = extractDuplicateCashtags(input.headline, input.summary);
  const method = input.method || "unknown";

  if (!input.valid) {
    return {
      disposition: "reject",
      confidence: input.confidence,
      method,
      reason: input.reason || "invalid",
      ambiguousCashtags,
    };
  }

  if (ambiguousCashtags.length >= 2) {
    return {
      disposition: "quarantine",
      confidence: input.confidence,
      method,
      reason: "duplicate_cashtags",
      ambiguousCashtags,
    };
  }

  if (input.confidence < MATCH_QUARANTINE_FLOOR) {
    return {
      disposition: "reject",
      confidence: input.confidence,
      method,
      reason: "below_quarantine_floor",
      ambiguousCashtags,
    };
  }

  if (input.confidence < MATCH_PUBLISH_FLOOR) {
    return {
      disposition: "quarantine",
      confidence: input.confidence,
      method,
      reason: "low_match_confidence",
      ambiguousCashtags,
    };
  }

  if (
    method === "headline_parse" &&
    input.confidence < 55 &&
    !/\$[A-Z]{1,5}\b/.test(input.headline) &&
    !/\((?:NASDAQ|NYSE|AMEX)/i.test(input.headline)
  ) {
    return {
      disposition: "quarantine",
      confidence: input.confidence,
      method,
      reason: "ambiguous_name_match",
      ambiguousCashtags,
    };
  }

  return {
    disposition: "publish",
    confidence: input.confidence,
    method,
    reason: "ok",
    ambiguousCashtags,
  };
}

/** All cashtags in text — duplicates across competing tickers → quarantine. */
export function extractDuplicateCashtags(
  headline: string,
  summary?: string
): string[] {
  const text = `${headline} ${summary ?? ""}`;
  const found = new Set<string>();
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
}

/** Lightweight cashtag / exchange-tag extractor for tests and quarantine hints. */
export function extractCashtagsAndExchangeTags(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) {
    found.add(m[1].toUpperCase());
  }
  for (const m of text.matchAll(
    /\((?:NASDAQ|NYSE|AMEX|OTC)[:\s]+([A-Z]{1,5})\)/gi
  )) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
}

export function inferMatchMethod(symbol: string, headline: string): string {
  if (new RegExp(`\\$${symbol}\\b`).test(headline)) return "cashtag";
  if (new RegExp(`\\((?:NASDAQ|NYSE|AMEX|OTC)[:\\s]+${symbol}\\)`, "i").test(headline)) {
    return "exchange_tag";
  }
  if (new RegExp(`\\(\\s*${symbol}\\s*\\)`).test(headline)) return "paren_ticker";
  return "headline_parse";
}
