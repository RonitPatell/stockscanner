/**
 * Read-only filing redline report — DB cache only.
 */

import { prisma } from "../prisma.ts";
import { FILINGS_ENGINE_VERSION } from "./types.ts";
import type { FilingDiffStatus, FilingSectionKey } from "./types.ts";

export type FilingSectionDiffView = {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  formType: string;
  filingDate: string | null;
  status: FilingDiffStatus | string;
  materialChange: boolean;
  added: string[];
  removed: string[];
  changed: Array<{ before: string; after: string }>;
  stats: Record<string, number> | null;
  currentAccession: string;
  priorAccession: string | null;
  currentSourceUrl: string | null;
  priorSourceUrl: string | null;
};

export type FilingsReport = {
  symbol: string;
  version: string;
  asOf: string;
  sections: FilingSectionDiffView[];
  empty: boolean;
};

export async function getFilingsReportForSymbol(
  symbol: string,
  limit = 30
): Promise<FilingsReport> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.filingSectionSnapshot.findMany({
    where: { symbol: sym },
    orderBy: [{ filingDate: "desc" }, { createdAt: "desc" }],
    take: Math.min(60, Math.max(1, limit)),
  });

  const sections: FilingSectionDiffView[] = rows.map((r) => {
    const diff = (r.diffJson ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      sectionKey: r.sectionKey,
      sectionTitle:
        r.sectionTitle ||
        (typeof diff.sectionTitle === "string"
          ? diff.sectionTitle
          : r.sectionKey),
      formType: r.formType,
      filingDate: r.filingDate?.toISOString() ?? null,
      status: (typeof diff.status === "string" ? diff.status : "unchanged") as FilingDiffStatus,
      materialChange: r.materialChange,
      added: Array.isArray(diff.added) ? (diff.added as string[]) : [],
      removed: Array.isArray(diff.removed) ? (diff.removed as string[]) : [],
      changed: Array.isArray(diff.changed)
        ? (diff.changed as Array<{ before: string; after: string }>)
        : [],
      stats:
        diff.stats && typeof diff.stats === "object"
          ? (diff.stats as Record<string, number>)
          : null,
      currentAccession: r.accessionNumber,
      priorAccession: r.priorAccession,
      currentSourceUrl: r.sourceUrl,
      priorSourceUrl: r.priorSourceUrl,
    };
  });

  return {
    symbol: sym,
    version: FILINGS_ENGINE_VERSION,
    asOf: new Date().toISOString(),
    sections,
    empty: sections.length === 0,
  };
}

/** Recent material section-change events for What Changed (from cache). */
export async function getRecentMaterialFilingDiffs(
  symbol: string,
  limit = 8
): Promise<FilingSectionDiffView[]> {
  const report = await getFilingsReportForSymbol(symbol, 40);
  return report.sections
    .filter((s) => s.materialChange && s.status === "changed")
    .slice(0, limit);
}

export type { FilingSectionKey };
