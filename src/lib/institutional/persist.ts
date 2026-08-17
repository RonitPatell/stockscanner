/**
 * Process Form 13F-HR → InstitutionalHoldingSnapshot rows (background ingest).
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import {
  classifyAgainstPrior,
  classifyPositionChange,
  findPriorReportDate,
  holdingMatchKey,
  normalizeCusip,
} from "./compare.ts";
import { fetch13fDocuments } from "./fetch.ts";
import { parse13fInformationTable } from "./parse.ts";
import { resolveHoldingSymbol } from "./resolve-symbol.ts";
import {
  INSTITUTIONAL_ENGINE_VERSION,
  type PriorHolding,
} from "./types.ts";

/** Cap holdings persisted per filing (efficiency). Prefer largest by value. */
export const MAX_HOLDINGS_PER_FILING = 1_500;

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function filingFingerprint(accession: string): string {
  return createHash("sha256")
    .update(`13f|${accession}|${INSTITUTIONAL_ENGINE_VERSION}`)
    .digest("hex")
    .slice(0, 40);
}

function snapshotFingerprint(opts: {
  filerCik: string;
  reportDate: string;
  symbol: string;
  cusip: string | null;
  changeKind: string;
  accession: string;
}): string {
  const payload = [
    opts.filerCik,
    opts.reportDate,
    opts.symbol,
    opts.cusip ?? "",
    opts.changeKind,
    opts.accession,
    INSTITUTIONAL_ENGINE_VERSION,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 48);
}

/**
 * Ingest one 13F filing. Safe for cron / fire-and-forget hooks.
 * Does not run inside user page requests.
 */
export async function process13fFiling(opts: {
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  cik?: string | null;
  filerName?: string | null;
  filedAt?: Date | string | null;
  catalystId?: string | null;
  /** Offline tests */
  infoTableXml?: string | null;
  coverXml?: string | null;
}): Promise<{
  ok: boolean;
  accession: string | null;
  resolvedCount: number;
  holdingCount: number;
  skippedReason?: string;
}> {
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  if (!accession && !opts.infoTableXml) {
    return {
      ok: false,
      accession: null,
      resolvedCount: 0,
      holdingCount: 0,
      skippedReason: "missing_accession",
    };
  }

  const keyAccession = accession || "test-accession";

  const existing = await prisma.institutional13fFiling.findUnique({
    where: { accessionNumber: keyAccession },
    select: { status: true, resolvedCount: true, holdingCount: true },
  });
  if (existing?.status === "processed" && !opts.infoTableXml) {
    return {
      ok: true,
      accession: keyAccession,
      resolvedCount: existing.resolvedCount,
      holdingCount: existing.holdingCount,
      skippedReason: "already_processed",
    };
  }

  let coverXml = opts.coverXml ?? null;
  let infoTableXml = opts.infoTableXml ?? null;
  let sourceUrl = opts.sourceUrl ?? null;

  if (!infoTableXml) {
    const fetched = await fetch13fDocuments({
      cik: opts.cik,
      accessionNumber: keyAccession,
      sourceUrl: opts.sourceUrl,
    });
    if (!fetched) {
      await upsertFilingHeader({
        accession: keyAccession,
        filerCik: opts.cik ?? "unknown",
        filerName: opts.filerName ?? "Unknown",
        reportDate: new Date(),
        filedAt: toDate(opts.filedAt),
        sourceUrl,
        holdingCount: 0,
        resolvedCount: 0,
        status: "failed",
        errorNote: "document_unavailable",
      });
      return {
        ok: false,
        accession: keyAccession,
        resolvedCount: 0,
        holdingCount: 0,
        skippedReason: "document_unavailable",
      };
    }
    coverXml = fetched.coverXml;
    infoTableXml = fetched.infoTableXml;
    sourceUrl = fetched.sourceUrl;
  }

  const combined = [coverXml, infoTableXml].filter(Boolean).join("\n");
  const parsed = parse13fInformationTable(infoTableXml || combined, {
    filerCik: opts.cik,
    filerName: opts.filerName,
  });

  // Prefer cover for report date / filer
  if (coverXml) {
    const cover = parse13fInformationTable(coverXml, {
      filerCik: opts.cik,
      filerName: opts.filerName,
    });
    if (cover.reportDate) parsed.reportDate = cover.reportDate;
    if (cover.filerName) parsed.filerName = cover.filerName;
    if (cover.filerCik) parsed.filerCik = cover.filerCik;
  }

  const reportDate = toDate(parsed.reportDate);
  if (!reportDate) {
    await upsertFilingHeader({
      accession: keyAccession,
      filerCik: parsed.filerCik || opts.cik || "unknown",
      filerName: parsed.filerName || opts.filerName || "Unknown",
      reportDate: new Date(),
      filedAt: toDate(opts.filedAt),
      sourceUrl,
      holdingCount: parsed.holdings.length,
      resolvedCount: 0,
      status: "failed",
      errorNote: "missing_report_date",
    });
    return {
      ok: false,
      accession: keyAccession,
      resolvedCount: 0,
      holdingCount: parsed.holdings.length,
      skippedReason: "missing_report_date",
    };
  }

  const filerCik = String(
    parseInt(parsed.filerCik || opts.cik || "0", 10) || opts.cik || "0"
  );
  const filerName = parsed.filerName || opts.filerName || "Unknown filer";
  const filedAt = toDate(opts.filedAt);

  // Prior period for this filer
  const priorDates = await prisma.institutionalHoldingSnapshot.findMany({
    where: { filerCik },
    distinct: ["reportDate"],
    select: { reportDate: true },
    orderBy: { reportDate: "desc" },
    take: 8,
  });
  const priorReportDate = findPriorReportDate(
    priorDates.map((d) => d.reportDate),
    reportDate
  );

  const priorRows = priorReportDate
    ? await prisma.institutionalHoldingSnapshot.findMany({
        where: {
          filerCik,
          reportDate: priorReportDate,
          changeKind: { not: "exited" },
        },
        select: {
          symbol: true,
          cusip: true,
          shares: true,
          valueUsd: true,
          reportDate: true,
          accessionNumber: true,
          issuerName: true,
        },
        take: MAX_HOLDINGS_PER_FILING,
      })
    : [];

  const priorByKey = new Map<string, PriorHolding>();
  for (const p of priorRows) {
    const key = holdingMatchKey({
      cusip: p.cusip,
      symbol: p.symbol,
      issuerName: p.issuerName,
    });
    priorByKey.set(key, {
      symbol: p.symbol,
      cusip: p.cusip,
      shares: p.shares,
      valueUsd: p.valueUsd,
      reportDate: p.reportDate,
      accessionNumber: p.accessionNumber,
    });
  }

  // Resolve + rank by value
  type Resolved = {
    symbol: string;
    holding: (typeof parsed.holdings)[0];
  };
  const resolved: Resolved[] = [];
  for (const h of parsed.holdings) {
    // Skip options for core equity view unless we want them — keep but prefer SH
    if (h.putCall && /put|call/i.test(h.putCall)) continue;
    const symbol = await resolveHoldingSymbol({
      cusip: h.cusip,
      issuerName: h.issuerName,
    });
    if (!symbol) continue;
    resolved.push({ symbol, holding: h });
  }

  resolved.sort(
    (a, b) => (b.holding.valueUsd ?? 0) - (a.holding.valueUsd ?? 0)
  );
  const capped = resolved.slice(0, MAX_HOLDINGS_PER_FILING);
  const seenKeys = new Set<string>();

  for (const { symbol, holding } of capped) {
    const key = holdingMatchKey({
      cusip: holding.cusip,
      symbol,
      issuerName: holding.issuerName,
    });
    seenKeys.add(key);
    const prior = priorByKey.get(key) ?? null;
    const classified = classifyAgainstPrior({
      currentShares: holding.shares,
      currentValue: holding.valueUsd,
      prior,
    });

    const reportDateIso = reportDate.toISOString().slice(0, 10);
    const fp = snapshotFingerprint({
      filerCik,
      reportDate: reportDateIso,
      symbol,
      cusip: normalizeCusip(holding.cusip),
      changeKind: classified.changeKind,
      accession: keyAccession,
    });

    await prisma.institutionalHoldingSnapshot.upsert({
      where: { fingerprint: fp },
      create: {
        symbol,
        cusip: normalizeCusip(holding.cusip),
        issuerName: holding.issuerName,
        filerCik,
        filerName,
        reportDate,
        filedAt,
        shares: holding.shares,
        valueUsd: holding.valueUsd,
        putCall: holding.putCall,
        investmentDiscretion: holding.investmentDiscretion,
        changeKind: classified.changeKind,
        priorShares: classified.priorShares,
        priorValueUsd: classified.priorValueUsd,
        priorReportDate: classified.priorReportDate,
        priorAccession: classified.priorAccession,
        sharesChange: classified.sharesChange,
        valueChange: classified.valueChange,
        accessionNumber: keyAccession,
        sourceUrl,
        fingerprint: fp,
        metricsJson: {
          version: INSTITUTIONAL_ENGINE_VERSION,
          titleOfClass: holding.titleOfClass,
        } as Prisma.InputJsonValue,
      },
      update: {
        shares: holding.shares,
        valueUsd: holding.valueUsd,
        changeKind: classified.changeKind,
        priorShares: classified.priorShares,
        priorValueUsd: classified.priorValueUsd,
        priorReportDate: classified.priorReportDate,
        priorAccession: classified.priorAccession,
        sharesChange: classified.sharesChange,
        valueChange: classified.valueChange,
        sourceUrl: sourceUrl ?? undefined,
        filerName,
        filedAt: filedAt ?? undefined,
      },
    });
  }

  // Exits: prior holdings not in current resolved set
  if (priorReportDate) {
    for (const [key, prior] of priorByKey) {
      if (seenKeys.has(key)) continue;
      const { changeKind, sharesChange } = classifyPositionChange({
        currentShares: 0,
        priorShares: prior.shares,
        isExit: true,
      });
      const reportDateIso = reportDate.toISOString().slice(0, 10);
      const fp = snapshotFingerprint({
        filerCik,
        reportDate: reportDateIso,
        symbol: prior.symbol,
        cusip: normalizeCusip(prior.cusip),
        changeKind: "exited",
        accession: keyAccession,
      });
      await prisma.institutionalHoldingSnapshot.upsert({
        where: { fingerprint: fp },
        create: {
          symbol: prior.symbol,
          cusip: normalizeCusip(prior.cusip),
          filerCik,
          filerName,
          reportDate,
          filedAt,
          shares: 0,
          valueUsd: 0,
          changeKind,
          priorShares: prior.shares,
          priorValueUsd: prior.valueUsd,
          priorReportDate: prior.reportDate,
          priorAccession: prior.accessionNumber,
          sharesChange,
          valueChange:
            prior.valueUsd != null ? -prior.valueUsd : null,
          accessionNumber: keyAccession,
          sourceUrl,
          fingerprint: fp,
          metricsJson: {
            version: INSTITUTIONAL_ENGINE_VERSION,
            exit: true,
          } as Prisma.InputJsonValue,
        },
        update: {
          changeKind: "exited",
          shares: 0,
          valueUsd: 0,
          priorShares: prior.shares,
          priorValueUsd: prior.valueUsd,
          sharesChange,
        },
      });
    }
  }

  await upsertFilingHeader({
    accession: keyAccession,
    filerCik,
    filerName,
    reportDate,
    filedAt,
    sourceUrl,
    holdingCount: parsed.holdings.length,
    resolvedCount: capped.length,
    status: "processed",
    errorNote: null,
  });

  return {
    ok: true,
    accession: keyAccession,
    resolvedCount: capped.length,
    holdingCount: parsed.holdings.length,
  };
}

async function upsertFilingHeader(opts: {
  accession: string;
  filerCik: string;
  filerName: string;
  reportDate: Date;
  filedAt: Date | null;
  sourceUrl: string | null;
  holdingCount: number;
  resolvedCount: number;
  status: string;
  errorNote: string | null;
}) {
  const fp = filingFingerprint(opts.accession);
  await prisma.institutional13fFiling.upsert({
    where: { accessionNumber: opts.accession },
    create: {
      filerCik: opts.filerCik,
      filerName: opts.filerName,
      reportDate: opts.reportDate,
      filedAt: opts.filedAt,
      accessionNumber: opts.accession,
      sourceUrl: opts.sourceUrl,
      holdingCount: opts.holdingCount,
      resolvedCount: opts.resolvedCount,
      status: opts.status,
      errorNote: opts.errorNote,
      fingerprint: fp,
    },
    update: {
      filerName: opts.filerName,
      reportDate: opts.reportDate,
      filedAt: opts.filedAt ?? undefined,
      sourceUrl: opts.sourceUrl ?? undefined,
      holdingCount: opts.holdingCount,
      resolvedCount: opts.resolvedCount,
      status: opts.status,
      errorNote: opts.errorNote,
    },
  });
}
