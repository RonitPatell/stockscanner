/**
 * Read-only institutional filings reports — never sync-fetch SEC in request path.
 */

import { prisma } from "../prisma.ts";
import { changeKindLabel } from "./compare.ts";
import type { InstitutionalChangeKind } from "./types.ts";
import { INSTITUTIONAL_ENGINE_VERSION } from "./types.ts";

export type InstitutionalPositionView = {
  filerCik: string;
  filerName: string;
  symbol: string;
  issuerName: string | null;
  reportDate: string;
  filedAt: string | null;
  shares: number | null;
  valueUsd: number | null;
  changeKind: InstitutionalChangeKind;
  changeLabel: string;
  priorShares: number | null;
  sharesChange: number | null;
  valueChange: number | null;
  priorReportDate: string | null;
  accessionNumber: string | null;
  sourceUrl: string | null;
};

export type CompanyInstitutionalReport = {
  symbol: string;
  version: string;
  asOf: string;
  /** Visible delay disclosure */
  disclosure: string;
  positions: InstitutionalPositionView[];
  empty: boolean;
};

export type Institution13fReport = {
  filerCik: string;
  filerName: string;
  version: string;
  asOf: string;
  disclosure: string;
  latestReportDate: string | null;
  priorReportDate: string | null;
  filedAt: string | null;
  accessionNumber: string | null;
  sourceUrl: string | null;
  largestNew: InstitutionalPositionView[];
  largestIncreases: InstitutionalPositionView[];
  largestReductions: InstitutionalPositionView[];
  exited: InstitutionalPositionView[];
  empty: boolean;
};

const DISCLOSURE =
  "Institutional filings (Form 13F) are delayed. Figures reflect the reported period end and filing date — not real-time positions.";

function mapRow(r: {
  filerCik: string;
  filerName: string;
  symbol: string;
  issuerName: string | null;
  reportDate: Date;
  filedAt: Date | null;
  shares: number | null;
  valueUsd: number | null;
  changeKind: string;
  priorShares: number | null;
  sharesChange: number | null;
  valueChange: number | null;
  priorReportDate: Date | null;
  accessionNumber: string | null;
  sourceUrl: string | null;
}): InstitutionalPositionView {
  const kind = (r.changeKind || "unknown") as InstitutionalChangeKind;
  return {
    filerCik: r.filerCik,
    filerName: r.filerName,
    symbol: r.symbol,
    issuerName: r.issuerName,
    reportDate: r.reportDate.toISOString(),
    filedAt: r.filedAt?.toISOString() ?? null,
    shares: r.shares,
    valueUsd: r.valueUsd,
    changeKind: kind,
    changeLabel: changeKindLabel(kind),
    priorShares: r.priorShares,
    sharesChange: r.sharesChange,
    valueChange: r.valueChange,
    priorReportDate: r.priorReportDate?.toISOString() ?? null,
    accessionNumber: r.accessionNumber,
    sourceUrl: r.sourceUrl,
  };
}

/**
 * Company view: institutions with reported positions in this symbol (latest periods).
 */
export async function getCompanyInstitutionalReport(
  symbol: string,
  limit = 40
): Promise<CompanyInstitutionalReport> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.institutionalHoldingSnapshot.findMany({
    where: { symbol: sym },
    orderBy: [{ reportDate: "desc" }, { valueUsd: "desc" }],
    take: Math.min(80, Math.max(1, limit)),
  });

  // Prefer latest reportDate cohort
  const latest = rows[0]?.reportDate ?? null;
  const latestIso = latest?.toISOString().slice(0, 10);
  const filtered = latestIso
    ? rows.filter(
        (r) => r.reportDate.toISOString().slice(0, 10) === latestIso
      )
    : rows;

  const positions = filtered.slice(0, limit).map(mapRow);

  return {
    symbol: sym,
    version: INSTITUTIONAL_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    disclosure: DISCLOSURE,
    positions,
    empty: positions.length === 0,
  };
}

/**
 * Institution view: latest 13F vs prior comparable — largest new/up/down/exits.
 */
export async function getInstitution13fReport(
  filerCik: string,
  limit = 15
): Promise<Institution13fReport> {
  const cik = String(parseInt(filerCik, 10) || filerCik);
  const filing = await prisma.institutional13fFiling.findFirst({
    where: { filerCik: cik, status: "processed" },
    orderBy: [{ reportDate: "desc" }],
  });

  const latestReportDate = filing?.reportDate ?? null;
  if (!latestReportDate) {
    return {
      filerCik: cik,
      filerName: filing?.filerName ?? "Unknown",
      version: INSTITUTIONAL_ENGINE_VERSION,
      asOf: new Date().toISOString(),
      disclosure: DISCLOSURE,
      latestReportDate: null,
      priorReportDate: null,
      filedAt: null,
      accessionNumber: null,
      sourceUrl: null,
      largestNew: [],
      largestIncreases: [],
      largestReductions: [],
      exited: [],
      empty: true,
    };
  }

  const rows = await prisma.institutionalHoldingSnapshot.findMany({
    where: { filerCik: cik, reportDate: latestReportDate },
    take: 2_000,
  });

  const priorReportDate =
    rows.find((r) => r.priorReportDate)?.priorReportDate ?? null;

  const lim = Math.min(30, Math.max(1, limit));
  const byAbsShareChange = (a: (typeof rows)[0], b: (typeof rows)[0]) =>
    Math.abs(b.sharesChange ?? 0) - Math.abs(a.sharesChange ?? 0);
  const byValue = (a: (typeof rows)[0], b: (typeof rows)[0]) =>
    (b.valueUsd ?? 0) - (a.valueUsd ?? 0);

  const largestNew = rows
    .filter((r) => r.changeKind === "new")
    .sort(byValue)
    .slice(0, lim)
    .map(mapRow);
  const largestIncreases = rows
    .filter((r) => r.changeKind === "increased")
    .sort(byAbsShareChange)
    .slice(0, lim)
    .map(mapRow);
  const largestReductions = rows
    .filter((r) => r.changeKind === "reduced")
    .sort(byAbsShareChange)
    .slice(0, lim)
    .map(mapRow);
  const exited = rows
    .filter((r) => r.changeKind === "exited")
    .sort(byAbsShareChange)
    .slice(0, lim)
    .map(mapRow);

  return {
    filerCik: cik,
    filerName: filing?.filerName ?? rows[0]?.filerName ?? "Unknown",
    version: INSTITUTIONAL_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    disclosure: DISCLOSURE,
    latestReportDate: latestReportDate.toISOString(),
    priorReportDate: priorReportDate?.toISOString() ?? null,
    filedAt: filing?.filedAt?.toISOString() ?? null,
    accessionNumber: filing?.accessionNumber ?? null,
    sourceUrl: filing?.sourceUrl ?? null,
    largestNew,
    largestIncreases,
    largestReductions,
    exited,
    empty: rows.length === 0,
  };
}
