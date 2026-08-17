/**
 * Background batch: process recent 13F-HR catalysts not yet ingested.
 */

import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import { process13fFiling } from "./persist.ts";

export async function runInstitutional13fCron(opts?: {
  limit?: number;
  sinceHours?: number;
}): Promise<{
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
}> {
  const limit = Math.min(15, Math.max(1, opts?.limit ?? 8));
  const sinceHours = opts?.sinceHours ?? 72;
  const since = new Date(Date.now() - sinceHours * 3_600_000);

  const catalysts = await prisma.catalyst.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { rawNewsId: { startsWith: "sec-13f-hr" } },
        { headline: { contains: "13F-HR", mode: "insensitive" } },
        { headline: { contains: "Form 13F", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
    select: {
      id: true,
      symbol: true,
      headline: true,
      sourceUrl: true,
      rawNewsId: true,
      publishedAt: true,
    },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;

  for (const c of catalysts) {
    if (processed + failed >= limit) break;
    scanned++;
    const accession = parseAccessionFromUrl(c.sourceUrl);
    if (!accession) {
      skipped++;
      continue;
    }
    const done = await prisma.institutional13fFiling.findUnique({
      where: { accessionNumber: accession },
      select: { status: true },
    });
    if (done?.status === "processed") {
      skipped++;
      continue;
    }

    const cik = c.headline.match(/\((\d{6,10})\)/)?.[1] ?? null;
    try {
      const result = await process13fFiling({
        accessionNumber: accession,
        sourceUrl: c.sourceUrl,
        cik,
        filedAt: c.publishedAt,
        catalystId: c.id,
      });
      if (result.ok) processed++;
      else if (result.skippedReason === "already_processed") skipped++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { scanned, processed, skipped, failed };
}
