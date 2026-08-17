/**
 * Persist structured 13D/13G extracts + emit Watchtower events when warranted.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import { persistCompanyEvents } from "../company-events/persist.ts";
import {
  buildOwnershipSummary,
  classifyOwnershipChange,
  type PriorOwnershipRow,
} from "./compare.ts";
import { mapOwnershipToCompanyEvents } from "./events.ts";
import { fetchOwnershipDocument } from "./fetch.ts";
import { parseBeneficialOwnershipDocument } from "./parse.ts";
import {
  OWNERSHIP_ENGINE_VERSION,
  type BeneficialOwnershipExtract,
} from "./types.ts";

function toDate(v: Date | string | null | undefined): Date {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    if (Number.isFinite(d.getTime())) return d;
  }
  return new Date();
}

function normalizeFilerKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|l\.?p\.?|inc|corp|ltd|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ownershipFingerprint(opts: {
  symbol: string;
  accessionNumber: string;
  filerName: string;
}): string {
  const payload = [
    opts.symbol,
    opts.accessionNumber,
    normalizeFilerKey(opts.filerName),
    OWNERSHIP_ENGINE_VERSION,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 48);
}

async function findPriorFiling(opts: {
  symbol: string;
  filerName: string;
  before: Date;
  excludeAccession: string;
}): Promise<PriorOwnershipRow | null> {
  const key = normalizeFilerKey(opts.filerName);
  const candidates = await prisma.beneficialOwnershipFiling.findMany({
    where: {
      symbol: opts.symbol,
      filedAt: { lt: opts.before },
      accessionNumber: { not: opts.excludeAccession },
      percentOwned: { not: null },
      parseStatus: { in: ["ok", "partial"] },
    },
    orderBy: [{ filedAt: "desc" }],
    take: 40,
    select: {
      filerName: true,
      percentOwned: true,
      sharesOwned: true,
      accessionNumber: true,
      filedAt: true,
    },
  });

  const match = candidates.find(
    (c) => normalizeFilerKey(c.filerName) === key
  );
  if (!match || match.percentOwned == null) return null;
  return {
    percentOwned: match.percentOwned,
    sharesOwned: match.sharesOwned,
    accessionNumber: match.accessionNumber,
    filedAt: match.filedAt,
  };
}

/**
 * Process one 13D/13G filing. Unparseable docs → no structured row / no false events.
 */
export async function processOwnershipFiling(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  filedAt?: Date | string | null;
  catalystId?: string | null;
  formType?: string | null;
  /** Offline / tests */
  body?: string | null;
}): Promise<{
  extracted: boolean;
  id: string | null;
  extract: BeneficialOwnershipExtract | null;
  skippedReason?: string;
}> {
  const sym = opts.symbol.trim().toUpperCase();
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  const formHint = opts.formType ?? null;

  let body = opts.body ?? null;
  let sourceUrl = opts.sourceUrl ?? null;

  if (!body) {
    const fetched = await fetchOwnershipDocument({
      cik: opts.cik,
      accessionNumber: accession,
      sourceUrl: opts.sourceUrl,
    });
    if (!fetched) {
      return {
        extracted: false,
        id: null,
        extract: null,
        skippedReason: "document_unavailable",
      };
    }
    body = fetched.body;
    sourceUrl = fetched.sourceUrl;
  }

  const parsed = parseBeneficialOwnershipDocument(body, {
    formTypeHint: formHint || opts.formType,
  });

  // Do not invent structured data from unparseable filings
  if (
    parsed.parseStatus === "unparseable" ||
    (!parsed.filerName && parsed.percentOwned == null)
  ) {
    return {
      extracted: false,
      id: null,
      extract: null,
      skippedReason: "unparseable",
    };
  }

  // Require filer + at least percent OR shares to persist
  if (!parsed.filerName || (parsed.percentOwned == null && parsed.sharesOwned == null)) {
    return {
      extracted: false,
      id: null,
      extract: null,
      skippedReason: "insufficient_fields",
    };
  }

  // Prefer not to emit material events without % — still allow persist of shares-only as partial
  const filedAt = toDate(opts.filedAt);
  const keyAccession = accession || `no-acc-${sym}-${filedAt.toISOString().slice(0, 10)}`;

  const prior = await findPriorFiling({
    symbol: sym,
    filerName: parsed.filerName,
    before: filedAt,
    excludeAccession: keyAccession,
  });

  const comparison = classifyOwnershipChange({ current: parsed, prior });
  const summaryText = buildOwnershipSummary({
    filerName: parsed.filerName,
    percentOwned: parsed.percentOwned,
    sharesOwned: parsed.sharesOwned,
    formType: parsed.formType,
    isAmendment: parsed.isAmendment,
    structuredKind: comparison.structuredKind,
    previousPercent: comparison.previousPercent,
    percentChange: comparison.percentChange,
  });

  // Without percent, never emit structured Watchtower kinds
  const structuredKind =
    parsed.percentOwned == null ? "none" : comparison.structuredKind;

  const extract: BeneficialOwnershipExtract = {
    ...parsed,
    ...comparison,
    structuredKind,
    summaryText,
  };

  const fp = ownershipFingerprint({
    symbol: sym,
    accessionNumber: keyAccession,
    filerName: parsed.filerName,
  });

  const metricsJson = {
    version: OWNERSHIP_ENGINE_VERSION,
    evidenceSnippets: parsed.evidenceSnippets,
    parseWarnings: parsed.parseWarnings,
    tradingSymbol: parsed.tradingSymbol,
  };

  const row = await prisma.beneficialOwnershipFiling.upsert({
    where: { fingerprint: fp },
    create: {
      symbol: sym,
      cik: opts.cik ?? null,
      accessionNumber: keyAccession,
      formType: parsed.formType ?? opts.formType ?? "SC 13D",
      isAmendment: parsed.isAmendment,
      filedAt,
      filerName: parsed.filerName,
      filerCik: parsed.filerCik,
      issuerName: parsed.issuerName,
      percentOwned: parsed.percentOwned,
      sharesOwned: parsed.sharesOwned,
      previousPercent: comparison.previousPercent,
      previousShares: comparison.previousShares,
      previousAccession: comparison.previousAccession,
      percentChange: comparison.percentChange,
      structuredKind,
      summaryText,
      confidence: parsed.confidence,
      parseStatus: parsed.parseStatus,
      sourceUrl,
      fingerprint: fp,
      metricsJson: metricsJson as Prisma.InputJsonValue,
    },
    update: {
      filedAt,
      formType: parsed.formType ?? opts.formType ?? undefined,
      isAmendment: parsed.isAmendment,
      filerCik: parsed.filerCik,
      issuerName: parsed.issuerName,
      percentOwned: parsed.percentOwned,
      sharesOwned: parsed.sharesOwned,
      previousPercent: comparison.previousPercent,
      previousShares: comparison.previousShares,
      previousAccession: comparison.previousAccession,
      percentChange: comparison.percentChange,
      structuredKind,
      summaryText,
      confidence: parsed.confidence,
      parseStatus: parsed.parseStatus,
      sourceUrl: sourceUrl ?? undefined,
      metricsJson: metricsJson as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const events = mapOwnershipToCompanyEvents({
    symbol: sym,
    cik: opts.cik,
    accessionNumber: keyAccession,
    sourceUrl,
    filedAt,
    catalystId: opts.catalystId,
    formType: parsed.formType,
    filerName: parsed.filerName,
    percentOwned: parsed.percentOwned,
    sharesOwned: parsed.sharesOwned,
    previousPercent: comparison.previousPercent,
    percentChange: comparison.percentChange,
    structuredKind,
    summaryText,
    filingId: row.id,
  });

  if (events.length > 0) {
    const persisted = await persistCompanyEvents(events);
    if (persisted.ids[0]) {
      await prisma.beneficialOwnershipFiling
        .update({
          where: { id: row.id },
          data: { companyEventId: persisted.ids[0] },
        })
        .catch(() => {});
    }
  }

  return { extracted: true, id: row.id, extract };
}
