/**
 * Catalyst → Form 4 structured insider hook (fire-and-forget from ingest).
 */

import { parseAccessionFromUrl, parseFormFromRawNewsId } from "../dilution/extract.ts";

export type CatalystInsiderHookInput = {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  source: string;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  publishedAt?: Date | string | null;
  cik?: string | null;
  /** Tests / offline: skip EDGAR fetch */
  xml?: string | null;
};

const FORM4_RAW = /^sec-4\b/i;
const FORM4_HEADLINE = /\bform\s*4\b|\binsider\s+transaction\b/i;

export function shouldExtractForm4(input: {
  source: string;
  rawNewsId?: string | null;
  headline: string;
  summary?: string | null;
  formType?: string | null;
}): boolean {
  if (input.formType && /^4(\/A)?$/i.test(input.formType.trim())) return true;
  if (input.rawNewsId && FORM4_RAW.test(input.rawNewsId)) return true;
  const form = parseFormFromRawNewsId(input.rawNewsId);
  if (form && /^4(\/A)?$/i.test(form)) return true;
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.source === "SEC EDGAR" && FORM4_HEADLINE.test(text)) return true;
  return false;
}

/**
 * Fetch/parse Form 4 XML → InsiderTransaction + Watchtower events.
 * Non-throwing for ingest hooks.
 */
export async function processCatalystForInsiders(
  input: CatalystInsiderHookInput
): Promise<{ extracted: number; ids: string[] }> {
  if (!shouldExtractForm4(input) && !input.xml) {
    return { extracted: 0, ids: [] };
  }

  const { processForm4Filing } = await import("./persist.ts");
  const result = await processForm4Filing({
    symbol: input.symbol,
    cik: input.cik,
    accessionNumber: parseAccessionFromUrl(input.sourceUrl),
    sourceUrl: input.sourceUrl,
    filedAt: input.publishedAt,
    catalystId: input.catalystId,
    xml: input.xml,
  });

  return { extracted: result.extracted, ids: result.ids };
}
