import type { MetricCohort } from "./types.ts";

const BREAKING_EARNINGS =
  /\b(beats?|misses?|topped|topping|below estimates?|above estimates?|surprises?|raises? guidance|cuts? guidance|withdraws? guidance)\b/i;

const SCHEDULED_EARNINGS =
  /\b(to report|will report|reports? (tonight|tomorrow|monday|tuesday|wednesday|thursday|friday)|earnings (call|release) scheduled|scheduled to announce|set to report)\b/i;

const URGENT_FILING =
  /\b(8-?k|material event|item\s*2\.02|item\s*8\.01|item\s*1\.01|going concern|bankruptcy|chapter\s*11)\b/i;

const ROUNDUP_LANGUAGE =
  /\b(stocks?\s+to\s+watch|movers?\s+to\s+watch|today'?s\s+movers?|market\s+recap|what\s+to\s+watch|top\s+gainers?|top\s+losers?|biggest\s+movers?)\b/i;

export interface CohortInput {
  catalystType: string | null | undefined;
  headline: string;
  summary?: string | null;
  source?: string | null;
  relatedSymbols?: string[] | null;
  providerItemId?: string | null;
}

/**
 * Bucket items so public speed metrics never blend scheduled earnings,
 * editorial recaps, and urgent filings into one number.
 */
export function classifyMetricCohort(input: CohortInput): {
  metricCohort: MetricCohort;
  actionable: boolean;
} {
  const type = (input.catalystType ?? "").toLowerCase();
  const headline = input.headline ?? "";
  const summary = input.summary ?? "";
  const related = input.relatedSymbols?.length ?? 0;
  const id = input.providerItemId ?? "";
  const source = input.source ?? "";
  const text = `${headline} ${summary}`;

  const isRoundup =
    type === "macro" ||
    related >= 2 ||
    ROUNDUP_LANGUAGE.test(text);

  if (isRoundup) {
    return { metricCohort: "editorial_recap", actionable: false };
  }

  const isSec =
    source === "SEC EDGAR" ||
    type === "sec_filing" ||
    id.startsWith("sec-");

  if (isSec) {
    const form4 = id.includes("sec-4-") || /\bform\s*4\b/i.test(headline);
    const prospectus =
      id.includes("sec-424b5-") ||
      /\b424b5\b/i.test(headline) ||
      /\bprospectus\b/i.test(headline);
    if (
      URGENT_FILING.test(headline) ||
      id.includes("sec-8-k-") ||
      (!form4 && !prospectus && type === "sec_filing")
    ) {
      return { metricCohort: "urgent_filing", actionable: true };
    }
    if (form4 || prospectus) {
      return { metricCohort: "other", actionable: true };
    }
    return { metricCohort: "urgent_filing", actionable: true };
  }

  if (type === "earnings") {
    if (SCHEDULED_EARNINGS.test(headline) && !BREAKING_EARNINGS.test(headline)) {
      return { metricCohort: "scheduled_earnings", actionable: false };
    }
    if (BREAKING_EARNINGS.test(headline)) {
      return { metricCohort: "actionable_breaking", actionable: true };
    }
    return { metricCohort: "scheduled_earnings", actionable: false };
  }

  if (
    type === "fda" ||
    type === "merger" ||
    type === "offering" ||
    type === "contract" ||
    type === "upgrade" ||
    type === "downgrade" ||
    type === "insider"
  ) {
    return { metricCohort: "actionable_breaking", actionable: true };
  }

  return { metricCohort: "other", actionable: false };
}
