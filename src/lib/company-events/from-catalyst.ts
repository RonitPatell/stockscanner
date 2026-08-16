/**
 * Catalyst → CompanyEvent hook (fire-and-forget from ingest).
 * Reuses dilution extraction for capital events; does not replace Catalyst rows.
 */

import {
  parseAccessionFromUrl,
  parseFormFromRawNewsId,
} from "../dilution/extract.ts";
import {
  classifyFilingDisclosure,
  shouldClassifyCompanyEvent,
} from "./classify.ts";
import { mapDilutionToCompanyEvents } from "./capital-map.ts";
import { persistCompanyEvents } from "./persist.ts";
import { resolveSecForm } from "./forms.ts";

export type CatalystCompanyEventInput = {
  catalystId: string;
  symbol: string;
  headline: string;
  summary?: string | null;
  body?: string | null;
  source: string;
  sourceUrl?: string | null;
  rawNewsId?: string | null;
  publishedAt?: Date | string | null;
  cik?: string | null;
  formType?: string | null;
};

/**
 * Classify + persist CompanyEvents for an SEC-sourced catalyst.
 * When dilution instruments are provided (from the dilution hook), also emit
 * confidence-gated capital events linked to those instruments.
 */
export async function processCatalystForCompanyEvents(
  input: CatalystCompanyEventInput,
  dilution?: {
    extracted: import("../dilution/types.ts").DilutionExtractionResult[];
    instrumentIds: string[];
  }
): Promise<{ upserted: number; ids: string[] }> {
  if (!shouldClassifyCompanyEvent(input)) {
    return { upserted: 0, ids: [] };
  }

  const accession =
    parseAccessionFromUrl(input.sourceUrl) || null;
  const formType =
    input.formType ||
    parseFormFromRawNewsId(input.rawNewsId) ||
    resolveSecForm({
      rawNewsId: input.rawNewsId,
      title: input.headline,
    }) ||
    null;

  const classified = classifyFilingDisclosure({
    symbol: input.symbol,
    cik: input.cik,
    formType,
    accessionNumber: accession,
    sourceUrl: input.sourceUrl,
    rawNewsId: input.rawNewsId,
    title: input.headline,
    summary: input.summary,
    body: input.body,
    publishedAt: input.publishedAt,
    catalystId: input.catalystId,
  });

  const capital =
    dilution && dilution.extracted.length > 0
      ? mapDilutionToCompanyEvents({
          symbol: input.symbol,
          cik: input.cik,
          accessionNumber: accession,
          rawNewsId: input.rawNewsId,
          sourceUrl: input.sourceUrl,
          publishedAt: input.publishedAt,
          catalystId: input.catalystId,
          formType,
          extracted: dilution.extracted,
          instrumentIds: dilution.instrumentIds,
        })
      : [];

  // Dedupe by fingerprint within this batch
  const byFp = new Map<string, (typeof classified)[number]>();
  for (const ev of [...classified, ...capital]) {
    byFp.set(ev.fingerprint, ev);
  }

  return persistCompanyEvents([...byFp.values()]);
}
