/**
 * Persist filing section snapshots + diffs (idempotent; no redownload when cached).
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import { persistCompanyEvents } from "../company-events/persist.ts";
import { diffSections, hashSectionText } from "./diff.ts";
import { extractFilingSections } from "./extract.ts";
import { mapSectionDiffToEvent } from "./events.ts";
import { fetchPeriodicFilingHtml } from "./fetch.ts";
import { FILINGS_ENGINE_VERSION } from "./types.ts";
import type { FilingSectionKey, SectionDiffResult } from "./types.ts";

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function baseForm(form: string | null | undefined): "10-Q" | "10-K" | null {
  if (!form) return null;
  const u = form.toUpperCase().replace(/\s+/g, "");
  if (u.startsWith("10-Q") || u.startsWith("10Q")) return "10-Q";
  if (u.startsWith("10-K") || u.startsWith("10K")) return "10-K";
  return null;
}

function isAmendment(form: string | null | undefined): boolean {
  return Boolean(form && /\/A$/i.test(form.trim()));
}

function fingerprint(accession: string, sectionKey: string): string {
  return createHash("sha256")
    .update(`filing-section|${accession}|${sectionKey}|${FILINGS_ENGINE_VERSION}`)
    .digest("hex")
    .slice(0, 48);
}

/**
 * Process 10-Q/10-K filing sections. Skips recompute when already cached.
 */
export async function processFilingSections(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber?: string | null;
  sourceUrl?: string | null;
  formType?: string | null;
  filingDate?: Date | string | null;
  catalystId?: string | null;
  html?: string | null;
  force?: boolean;
}): Promise<{
  processed: number;
  materialEvents: number;
  skippedReason?: string;
}> {
  const sym = opts.symbol.trim().toUpperCase();
  const accession =
    opts.accessionNumber || parseAccessionFromUrl(opts.sourceUrl) || null;
  const formBase = baseForm(opts.formType);
  if (!formBase && !opts.html) {
    return { processed: 0, materialEvents: 0, skippedReason: "not_periodic" };
  }

  const keyAccession = accession || `test-${sym}`;
  const resolvedForm = formBase || "10-Q";
  const formStored =
    resolvedForm + (isAmendment(opts.formType) ? "/A" : "");

  if (!opts.force && !opts.html && accession) {
    const existing = await prisma.filingSectionSnapshot.count({
      where: { accessionNumber: keyAccession },
    });
    if (existing >= 1) {
      return {
        processed: 0,
        materialEvents: 0,
        skippedReason: "already_cached",
      };
    }
  }

  let html = opts.html ?? null;
  let sourceUrl = opts.sourceUrl ?? null;
  if (!html) {
    const fetched = await fetchPeriodicFilingHtml({
      cik: opts.cik,
      accessionNumber: keyAccession,
      sourceUrl: opts.sourceUrl,
    });
    if (!fetched) {
      return {
        processed: 0,
        materialEvents: 0,
        skippedReason: "document_unavailable",
      };
    }
    html = fetched.html;
    sourceUrl = fetched.sourceUrl;
  }

  const sections = extractFilingSections(html);
  const filingDate = toDate(opts.filingDate) ?? new Date();

  let processed = 0;
  let materialEvents = 0;

  for (const sec of sections) {
    const prior = await findPriorSection({
      symbol: sym,
      sectionKey: sec.sectionKey,
      formBase: resolvedForm,
      before: filingDate,
      excludeAccession: keyAccession,
    });

    const currentText = sec.found ? sec.text : "";
    const priorCompareText = prior?.textExcerpt || null;

    const diff = diffSections({
      sectionKey: sec.sectionKey,
      priorText: priorCompareText,
      currentText: sec.found ? currentText : null,
    });

    if (!sec.found && !prior) continue;

    const textHash = hashSectionText(currentText || "");
    const excerpt = (currentText || "").slice(0, 12_000);
    const fp = fingerprint(keyAccession, sec.sectionKey);

    const diffJson = {
      version: FILINGS_ENGINE_VERSION,
      status: diff.status,
      sectionTitle: diff.sectionTitle,
      added: diff.added,
      removed: diff.removed,
      changed: diff.changed,
      stats: diff.stats,
      material: diff.material,
      priorAccession: prior?.accessionNumber ?? null,
      priorSourceUrl: prior?.sourceUrl ?? null,
      currentSourceUrl: sourceUrl,
      formType: formStored,
      amended: isAmendment(opts.formType),
    };

    const row = await prisma.filingSectionSnapshot.upsert({
      where: {
        accessionNumber_sectionKey: {
          accessionNumber: keyAccession,
          sectionKey: sec.sectionKey,
        },
      },
      create: {
        symbol: sym,
        cik: opts.cik ?? null,
        accessionNumber: keyAccession,
        formType: formStored,
        sectionKey: sec.sectionKey,
        sectionTitle: sec.sectionTitle,
        filingDate,
        textHash,
        textExcerpt: excerpt || null,
        priorAccession: prior?.accessionNumber ?? null,
        priorTextHash: prior?.textHash ?? null,
        priorSourceUrl: prior?.sourceUrl ?? null,
        diffJson: diffJson as Prisma.InputJsonValue,
        materialChange: diff.material,
        sourceUrl,
        fingerprint: fp,
      },
      update: {
        textHash,
        textExcerpt: excerpt || null,
        priorAccession: prior?.accessionNumber ?? null,
        priorTextHash: prior?.textHash ?? null,
        priorSourceUrl: prior?.sourceUrl ?? null,
        diffJson: diffJson as Prisma.InputJsonValue,
        materialChange: diff.material,
        sourceUrl: sourceUrl ?? undefined,
        sectionTitle: sec.sectionTitle,
        filingDate,
        formType: formStored,
      },
      select: { id: true },
    });

    processed++;

    const ev = mapSectionDiffToEvent({
      symbol: sym,
      cik: opts.cik,
      accessionNumber: keyAccession,
      formType: formStored,
      sourceUrl,
      priorSourceUrl: prior?.sourceUrl ?? null,
      priorAccession: prior?.accessionNumber ?? null,
      filingDate,
      catalystId: opts.catalystId,
      diff,
    });

    if (ev) {
      const persisted = await persistCompanyEvents([ev]);
      materialEvents++;
      if (persisted.ids[0]) {
        await prisma.filingSectionSnapshot
          .update({
            where: { id: row.id },
            data: { companyEventId: persisted.ids[0] },
          })
          .catch(() => {});
      }
    }
  }

  return { processed, materialEvents };
}

async function findPriorSection(opts: {
  symbol: string;
  sectionKey: FilingSectionKey;
  formBase: "10-Q" | "10-K";
  before: Date;
  excludeAccession: string;
}) {
  return prisma.filingSectionSnapshot.findFirst({
    where: {
      symbol: opts.symbol,
      sectionKey: opts.sectionKey,
      formType: { startsWith: opts.formBase },
      accessionNumber: { not: opts.excludeAccession },
      filingDate: { lt: opts.before },
      textExcerpt: { not: null },
    },
    orderBy: [{ filingDate: "desc" }, { createdAt: "desc" }],
  });
}

/** Pure helper for tests: compare two HTML bodies without DB */
export function compareFilingHtml(
  priorHtml: string,
  currentHtml: string
): SectionDiffResult[] {
  const priorSecs = extractFilingSections(priorHtml);
  const currSecs = extractFilingSections(currentHtml);
  const byKey = new Map(priorSecs.map((s) => [s.sectionKey, s]));
  return currSecs.map((c) => {
    const p = byKey.get(c.sectionKey);
    return diffSections({
      sectionKey: c.sectionKey,
      priorText: p?.found ? p.text : null,
      currentText: c.found ? c.text : null,
    });
  });
}
