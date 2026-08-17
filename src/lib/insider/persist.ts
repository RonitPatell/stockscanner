/**
 * Persist structured Form 4 rows + emit CompanyEvents + cluster checks.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import { persistCompanyEvents } from "../company-events/persist.ts";
import { mapInsiderTransactionsToEvents } from "./events.ts";
import { detectInsiderClusters, emitInsiderClusterEvents } from "./cluster.ts";
import { fetchForm4Xml } from "./fetch.ts";
import { parseForm4Xml } from "./parse.ts";
import type { Form4ParseResult, ParsedInsiderTransaction } from "./types.ts";
import { INSIDER_ENGINE_VERSION } from "./types.ts";

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function insiderTransactionFingerprint(opts: {
  symbol: string;
  accessionNumber: string;
  ownerName: string;
  transactionDate: string | null;
  transactionCode: string | null;
  shares: number | null;
  acquiredDisposed: string | null;
  securityTitle: string | null;
  index: number;
}): string {
  const payload = [
    opts.symbol,
    opts.accessionNumber,
    opts.ownerName,
    opts.transactionDate ?? "",
    opts.transactionCode ?? "",
    opts.shares ?? "",
    opts.acquiredDisposed ?? "",
    opts.securityTitle ?? "",
    String(opts.index),
    INSIDER_ENGINE_VERSION,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 48);
}

export async function persistParsedInsiderTransactions(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber: string;
  filedAt: Date;
  sourceUrl?: string | null;
  catalystId?: string | null;
  parsed: Form4ParseResult;
}): Promise<{ ids: string[]; rows: ParsedInsiderTransaction[] }> {
  const sym = opts.symbol.trim().toUpperCase();
  const ids: string[] = [];
  const rows: ParsedInsiderTransaction[] = [];

  for (let i = 0; i < opts.parsed.transactions.length; i++) {
    const tx = opts.parsed.transactions[i]!;
    const fp = insiderTransactionFingerprint({
      symbol: sym,
      accessionNumber: opts.accessionNumber,
      ownerName: tx.ownerName,
      transactionDate: tx.transactionDate,
      transactionCode: tx.transactionCode,
      shares: tx.shares,
      acquiredDisposed: tx.acquiredDisposed,
      securityTitle: tx.securityTitle,
      index: i,
    });

    const metricsJson = {
      version: INSIDER_ENGINE_VERSION,
      evidenceSnippets: tx.evidenceSnippets,
      footnoteIds: tx.footnoteIds,
      tradingSymbol: tx.tradingSymbol,
      parseWarnings: opts.parsed.parseWarnings,
    };

    const row = await prisma.insiderTransaction.upsert({
      where: { fingerprint: fp },
      create: {
        symbol: sym,
        cik: opts.cik ?? tx.issuerCik ?? null,
        accessionNumber: opts.accessionNumber,
        filedAt: opts.filedAt,
        transactionDate: toDate(tx.transactionDate),
        ownerName: tx.ownerName,
        ownerCik: tx.ownerCik,
        isDirector: tx.isDirector,
        isOfficer: tx.isOfficer,
        isTenPercent: tx.isTenPercent,
        officerTitle: tx.officerTitle,
        issuerName: tx.issuerName,
        transactionCode: tx.transactionCode,
        acquiredDisposed: tx.acquiredDisposed,
        shares: tx.shares,
        pricePerShare: tx.pricePerShare,
        transactionValue: tx.transactionValue,
        sharesOwnedAfter: tx.sharesOwnedAfter,
        isDirect: tx.isDirect,
        holdingChange: tx.holdingChange,
        securityTitle: tx.securityTitle,
        classification: tx.classification,
        is10b51: tx.is10b51,
        summaryText: tx.summaryText,
        footnotesJson: opts.parsed.footnotes as Prisma.InputJsonValue,
        metricsJson: metricsJson as Prisma.InputJsonValue,
        sourceUrl: opts.sourceUrl ?? null,
        fingerprint: fp,
      },
      update: {
        filedAt: opts.filedAt,
        transactionDate: toDate(tx.transactionDate) ?? undefined,
        ownerName: tx.ownerName,
        ownerCik: tx.ownerCik,
        isDirector: tx.isDirector,
        isOfficer: tx.isOfficer,
        isTenPercent: tx.isTenPercent,
        officerTitle: tx.officerTitle,
        issuerName: tx.issuerName,
        transactionCode: tx.transactionCode,
        acquiredDisposed: tx.acquiredDisposed,
        shares: tx.shares,
        pricePerShare: tx.pricePerShare,
        transactionValue: tx.transactionValue,
        sharesOwnedAfter: tx.sharesOwnedAfter,
        isDirect: tx.isDirect,
        holdingChange: tx.holdingChange,
        securityTitle: tx.securityTitle,
        classification: tx.classification,
        is10b51: tx.is10b51,
        summaryText: tx.summaryText,
        footnotesJson: opts.parsed.footnotes as Prisma.InputJsonValue,
        metricsJson: metricsJson as Prisma.InputJsonValue,
        sourceUrl: opts.sourceUrl ?? undefined,
      },
      select: { id: true },
    });
    ids.push(row.id);
    rows.push(tx);
  }

  return { ids, rows };
}

/**
 * Process a Form 4 filing: optional XML body, else fetch from EDGAR.
 */
export async function processForm4Filing(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  filedAt?: Date | string | null;
  catalystId?: string | null;
  /** When provided (tests / offline), skip network fetch. */
  xml?: string | null;
}): Promise<{
  extracted: number;
  ids: string[];
  parsed: Form4ParseResult | null;
}> {
  const sym = opts.symbol.trim().toUpperCase();
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession && !opts.xml) {
    return { extracted: 0, ids: [], parsed: null };
  }

  let xml = opts.xml ?? null;
  let sourceUrl = opts.sourceUrl ?? null;

  if (!xml) {
    const fetched = await fetchForm4Xml({
      cik: opts.cik,
      accessionNumber: accession,
      sourceUrl: opts.sourceUrl,
    });
    if (!fetched) {
      return { extracted: 0, ids: [], parsed: null };
    }
    xml = fetched.xml;
    sourceUrl = fetched.sourceUrl;
  }

  const parsed = parseForm4Xml(xml, { accessionNumber: accession });
  if (parsed.transactions.length === 0) {
    return { extracted: 0, ids: [], parsed };
  }

  const filedAt =
    opts.filedAt instanceof Date
      ? opts.filedAt
      : opts.filedAt
        ? new Date(opts.filedAt)
        : new Date();

  const keyAccession = accession || `no-acc-${sym}`;
  const { ids, rows } = await persistParsedInsiderTransactions({
    symbol: sym,
    cik: opts.cik,
    accessionNumber: keyAccession,
    filedAt: Number.isFinite(filedAt.getTime()) ? filedAt : new Date(),
    sourceUrl,
    catalystId: opts.catalystId,
    parsed,
  });

  const events = mapInsiderTransactionsToEvents({
    symbol: sym,
    cik: opts.cik,
    accessionNumber: keyAccession,
    sourceUrl,
    filedAt: Number.isFinite(filedAt.getTime()) ? filedAt : new Date(),
    catalystId: opts.catalystId,
    transactions: rows,
    transactionIds: ids,
  });

  const persisted = await persistCompanyEvents(events);
  // Link first matching event ids onto transactions (best-effort)
  for (let i = 0; i < ids.length && i < persisted.ids.length; i++) {
    await prisma.insiderTransaction
      .update({
        where: { id: ids[i]! },
        data: { companyEventId: persisted.ids[i]! },
      })
      .catch(() => {});
  }

  const clusters = await detectInsiderClusters(sym);
  if (clusters.length > 0) {
    await emitInsiderClusterEvents({
      symbol: sym,
      cik: opts.cik,
      clusters,
      catalystId: opts.catalystId,
    }).catch(() => {});
  }

  return { extracted: ids.length, ids, parsed };
}
