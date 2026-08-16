import { processFilingForDilution } from "./persist.ts";
import {
  parseAccessionFromUrl,
  parseFormFromRawNewsId,
} from "./extract.ts";

export interface CatalystDilutionHookInput {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  source: string;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  publishedAt?: Date | string | null;
  floatShares?: number | null;
  cik?: string | null;
}

const CAPITAL_SEC_ID =
  /^sec-(424b5|s-1|s-3|s-1\/a|s-3\/a)/i;

const CAPITAL_HEADLINE =
  /\b(424\s*b\s*5|424b5|form\s*s-1|form\s*s-3|s-1\/a|s-3\/a|prospectus\s+supplement|shelf\s+registration|registered\s+direct|at[\s-]?the[\s-]?market|equity\s+purchase|convertible\s+(note|preferred)|warrant\s+reprice|reverse\s+split|effective\s+registration)\b/i;

/** Whether this catalyst/article should run Dilution Radar V2 extraction. */
export function shouldExtractDilution(input: {
  source: string;
  rawNewsId?: string | null;
  headline: string;
  summary?: string | null;
}): boolean {
  if (input.rawNewsId && CAPITAL_SEC_ID.test(input.rawNewsId)) return true;
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.source === "SEC EDGAR" && CAPITAL_HEADLINE.test(text)) return true;
  if (CAPITAL_HEADLINE.test(text)) return true;
  return false;
}

/**
 * Extract + persist dilution instruments from a newly ingested catalyst.
 * Non-throwing for use in fire-and-forget ingest hooks.
 */
export async function processCatalystForDilution(
  input: CatalystDilutionHookInput
): Promise<{
  extracted: number;
  ids: string[];
  results: import("./types.ts").DilutionExtractionResult[];
}> {
  if (!shouldExtractDilution(input)) {
    return { extracted: 0, ids: [], results: [] };
  }

  const formType =
    parseFormFromRawNewsId(input.rawNewsId) ||
    (input.headline.match(/\b(424B5|S-1\/A|S-3\/A|S-1|S-3)\b/i)?.[1] ?? null);

  return processFilingForDilution({
    symbol: input.symbol,
    cik: input.cik,
    formType,
    accessionNumber: parseAccessionFromUrl(input.sourceUrl),
    sourceUrl: input.sourceUrl,
    filingDate: input.publishedAt,
    title: input.headline,
    summary: input.summary,
    sharesOutstanding: input.floatShares,
    catalystId: input.catalystId,
    rawNewsId: input.rawNewsId,
  });
}
