/**
 * Catalyst → 13F structured ingest hook (fire-and-forget; never blocks UI).
 */

import { parseAccessionFromUrl, parseFormFromRawNewsId } from "../dilution/extract.ts";

export type Catalyst13fHookInput = {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  source: string;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  publishedAt?: Date | string | null;
  cik?: string | null;
};

const RAW_13F = /^sec-13f-hr\b/i;
const HEAD_13F = /\b13f-hr\b|\bform\s*13f\b|\b13f\s+holding/i;

export function shouldExtract13f(input: {
  source: string;
  rawNewsId?: string | null;
  headline: string;
  summary?: string | null;
  formType?: string | null;
}): boolean {
  if (input.formType && /^13F/i.test(input.formType)) return true;
  if (input.rawNewsId && RAW_13F.test(input.rawNewsId)) return true;
  const form = parseFormFromRawNewsId(input.rawNewsId);
  if (form && /^13F/i.test(form)) return true;
  const text = `${input.headline} ${input.summary ?? ""}`;
  if (input.source === "SEC EDGAR" && HEAD_13F.test(text)) return true;
  return false;
}

/**
 * Queue-style: kick off 13F processing asynchronously.
 * Heavy parse stays out of the request that created the catalyst.
 */
export async function processCatalystFor13f(
  input: Catalyst13fHookInput
): Promise<{ started: boolean }> {
  if (!shouldExtract13f(input)) return { started: false };

  // Dynamic import keeps catalyst hot path light
  const { process13fFiling } = await import("./persist.ts");
  // Extract CIK from Atom title pattern when possible
  const cikFromHeadline = input.headline.match(/\((\d{6,10})\)/)?.[1] ?? null;

  await process13fFiling({
    accessionNumber: parseAccessionFromUrl(input.sourceUrl),
    sourceUrl: input.sourceUrl,
    cik: input.cik ?? cikFromHeadline,
    filerName: null,
    filedAt: input.publishedAt,
    catalystId: input.catalystId,
  });

  return { started: true };
}
