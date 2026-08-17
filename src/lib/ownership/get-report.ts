/**
 * Load structured beneficial ownership + institutional filings for ticker Ownership tab.
 * Reads precomputed DB rows only — no live SEC 13F fetch.
 */

import { prisma } from "../prisma.ts";
import { getCompanyInstitutionalReport } from "../institutional/get-report.ts";
import type { CompanyInstitutionalReport } from "../institutional/get-report.ts";
import { OWNERSHIP_ENGINE_VERSION } from "./types.ts";
import type { OwnershipStructuredKind } from "./types.ts";

export type BeneficialOwnershipView = {
  id: string;
  filerName: string;
  issuerName: string | null;
  formType: string;
  isAmendment: boolean;
  filedAt: string;
  percentOwned: number | null;
  sharesOwned: number | null;
  previousPercent: number | null;
  percentChange: number | null;
  structuredKind: OwnershipStructuredKind;
  summaryText: string | null;
  sourceUrl: string | null;
  accessionNumber: string;
};

export type OwnershipReport = {
  symbol: string;
  version: string;
  asOf: string;
  filings: BeneficialOwnershipView[];
  institutional: CompanyInstitutionalReport;
  empty: boolean;
};

const KIND_SET = new Set([
  "material_new",
  "pct_change",
  "exit_reduction",
  "none",
]);

export async function getOwnershipReportForSymbol(
  symbol: string,
  limit = 40
): Promise<OwnershipReport> {
  const sym = symbol.trim().toUpperCase();
  const [rows, institutional] = await Promise.all([
    prisma.beneficialOwnershipFiling.findMany({
      where: { symbol: sym },
      orderBy: [{ filedAt: "desc" }],
      take: Math.min(100, Math.max(1, limit)),
    }),
    getCompanyInstitutionalReport(sym, 30),
  ]);

  const filings: BeneficialOwnershipView[] = rows.map((r) => ({
    id: r.id,
    filerName: r.filerName,
    issuerName: r.issuerName,
    formType: r.formType,
    isAmendment: r.isAmendment,
    filedAt: r.filedAt.toISOString(),
    percentOwned: r.percentOwned,
    sharesOwned: r.sharesOwned,
    previousPercent: r.previousPercent,
    percentChange: r.percentChange,
    structuredKind: (KIND_SET.has(r.structuredKind)
      ? r.structuredKind
      : "none") as OwnershipStructuredKind,
    summaryText: r.summaryText,
    sourceUrl: r.sourceUrl,
    accessionNumber: r.accessionNumber,
  }));

  return {
    symbol: sym,
    version: OWNERSHIP_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    filings,
    institutional,
    empty: filings.length === 0 && institutional.empty,
  };
}
