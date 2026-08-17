/**
 * Catalyst → Schedule 13D/13G structured ownership hook.
 */

import { parseAccessionFromUrl, parseFormFromRawNewsId } from "../dilution/extract.ts";

export type CatalystOwnershipHookInput = {
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
  /** Offline / tests */
  body?: string | null;
};

const OWNERSHIP_RAW = /^sec-sc-13[dg]/i;
const OWNERSHIP_HEADLINE =
  /\bschedule\s+13[dg]\b|\bsc\s*13[dg]\b|\bbeneficial\s+ownership\b/i;

export function shouldExtractOwnership(input: {
  source: string;
  rawNewsId?: string | null;
  headline: string;
  summary?: string | null;
  formType?: string | null;
}): boolean {
  if (input.formType && /^SC\s*13[DG]/i.test(input.formType)) return true;
  if (input.rawNewsId && OWNERSHIP_RAW.test(input.rawNewsId)) return true;
  const form = parseFormFromRawNewsId(input.rawNewsId);
  if (form && /^SC\s*13[DG]/i.test(form)) return true;
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.source === "SEC EDGAR" && OWNERSHIP_HEADLINE.test(text)) return true;
  return false;
}

export async function processCatalystForOwnership(
  input: CatalystOwnershipHookInput
): Promise<{ extracted: boolean; id: string | null }> {
  if (!shouldExtractOwnership(input) && !input.body) {
    return { extracted: false, id: null };
  }

  const { processOwnershipFiling } = await import("./persist.ts");
  const formType =
    input.formType || parseFormFromRawNewsId(input.rawNewsId) || null;

  const result = await processOwnershipFiling({
    symbol: input.symbol,
    cik: input.cik,
    accessionNumber: parseAccessionFromUrl(input.sourceUrl),
    sourceUrl: input.sourceUrl,
    filedAt: input.publishedAt,
    catalystId: input.catalystId,
    formType,
    body: input.body,
  });

  return { extracted: result.extracted, id: result.id };
}
