/**
 * Load structured insider intelligence for ticker Insiders tab.
 */

import { prisma } from "../prisma.ts";
import { classificationLabel } from "./classify.ts";
import type { InsiderClassification } from "./types.ts";
import { INSIDER_ENGINE_VERSION } from "./types.ts";

export type InsiderTransactionView = {
  id: string;
  ownerName: string;
  role: string | null;
  issuerName: string | null;
  transactionDate: string | null;
  filedAt: string;
  transactionCode: string | null;
  acquiredDisposed: string | null;
  shares: number | null;
  pricePerShare: number | null;
  transactionValue: number | null;
  isDirect: boolean | null;
  sharesOwnedAfter: number | null;
  holdingChange: number | null;
  classification: InsiderClassification;
  classificationLabel: string;
  is10b51: boolean | null;
  summaryText: string | null;
  sourceUrl: string | null;
  accessionNumber: string;
};

export type InsiderReport = {
  symbol: string;
  version: string;
  asOf: string;
  transactions: InsiderTransactionView[];
  empty: boolean;
};

function roleFrom(row: {
  officerTitle: string | null;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPercent: boolean | null;
}): string | null {
  if (row.officerTitle?.trim()) return row.officerTitle.trim();
  const bits: string[] = [];
  if (row.isOfficer) bits.push("Officer");
  if (row.isDirector) bits.push("Director");
  if (row.isTenPercent) bits.push("10% owner");
  return bits.length ? bits.join(" / ") : null;
}

export async function getInsiderReportForSymbol(
  symbol: string,
  limit = 40
): Promise<InsiderReport> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.insiderTransaction.findMany({
    where: { symbol: sym },
    orderBy: [
      { transactionDate: "desc" },
      { filedAt: "desc" },
    ],
    take: Math.min(100, Math.max(1, limit)),
  });

  const transactions: InsiderTransactionView[] = rows.map((r) => {
    const classification = (
      INSIDER_CLASSIFICATIONS_SET.has(r.classification)
        ? r.classification
        : "other"
    ) as InsiderClassification;
    return {
      id: r.id,
      ownerName: r.ownerName,
      role: roleFrom(r),
      issuerName: r.issuerName,
      transactionDate: r.transactionDate?.toISOString() ?? null,
      filedAt: r.filedAt.toISOString(),
      transactionCode: r.transactionCode,
      acquiredDisposed: r.acquiredDisposed,
      shares: r.shares,
      pricePerShare: r.pricePerShare,
      transactionValue: r.transactionValue,
      isDirect: r.isDirect,
      sharesOwnedAfter: r.sharesOwnedAfter,
      holdingChange: r.holdingChange,
      classification,
      classificationLabel: classificationLabel(classification),
      is10b51: r.is10b51,
      summaryText: r.summaryText,
      sourceUrl: r.sourceUrl,
      accessionNumber: r.accessionNumber,
    };
  });

  return {
    symbol: sym,
    version: INSIDER_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    transactions,
    empty: transactions.length === 0,
  };
}

const INSIDER_CLASSIFICATIONS_SET = new Set([
  "open_market_purchase",
  "open_market_sale",
  "grant_award",
  "option_exercise",
  "gift",
  "tax_withholding",
  "other",
]);
