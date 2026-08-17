/**
 * Catalyst → 10-Q/10-K section redline hook (background; cached).
 */

import { parseAccessionFromUrl, parseFormFromRawNewsId } from "../dilution/extract.ts";

export type CatalystFilingsHookInput = {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  source: string;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  publishedAt?: Date | string | null;
  cik?: string | null;
  formType?: string | null;
  html?: string | null;
};

const PERIODIC_RAW = /^sec-10-[qk]/i;
const PERIODIC_HEAD = /\b10-[qk]\b|\bform\s*10-[qk]\b/i;

export function shouldExtractFilingSections(input: {
  source: string;
  rawNewsId?: string | null;
  headline: string;
  summary?: string | null;
  formType?: string | null;
}): boolean {
  if (input.formType && /^10-[QK]/i.test(input.formType.trim())) return true;
  if (input.rawNewsId && PERIODIC_RAW.test(input.rawNewsId)) return true;
  const form = parseFormFromRawNewsId(input.rawNewsId);
  if (form && /^10-[QK]/i.test(form)) return true;
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.source === "SEC EDGAR" && PERIODIC_HEAD.test(text)) return true;
  return false;
}

export async function processCatalystForFilingSections(
  input: CatalystFilingsHookInput
): Promise<{ processed: number; materialEvents: number }> {
  if (!shouldExtractFilingSections(input) && !input.html) {
    return { processed: 0, materialEvents: 0 };
  }

  const { processFilingSections } = await import("./persist.ts");
  const formType =
    input.formType || parseFormFromRawNewsId(input.rawNewsId) || null;

  const result = await processFilingSections({
    symbol: input.symbol,
    cik: input.cik,
    accessionNumber: parseAccessionFromUrl(input.sourceUrl),
    sourceUrl: input.sourceUrl,
    formType,
    filingDate: input.publishedAt,
    catalystId: input.catalystId,
    html: input.html,
  });

  return {
    processed: result.processed,
    materialEvents: result.materialEvents,
  };
}
