/**
 * Incremental 10-Q/10-K filing section backfill for Vercel cron.
 * Complements catalyst hooks — recovers work when hooks were truncated.
 */

import { prisma } from "../prisma.ts";
import { parseAccessionFromUrl } from "../dilution/extract.ts";
import { getJobCheckpoint, setJobCheckpoint } from "../cost/job-checkpoint.ts";
import { mapPool } from "../cost/map-pool.ts";
import {
  processCatalystForFilingSections,
  shouldExtractFilingSections,
} from "./from-catalyst.ts";

const CHECKPOINT_JOB = "cron:filings-sections";

export async function runFilingsSectionsCron(opts?: {
  limit?: number;
  sinceHours?: number;
  concurrency?: number;
  deadlineMs?: number;
}): Promise<{
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
  truncated: boolean;
}> {
  const limit = Math.min(12, Math.max(1, opts?.limit ?? 4));
  const sinceHours = opts?.sinceHours ?? 72;
  const concurrency = Math.min(2, Math.max(1, opts?.concurrency ?? 1));
  const deadlineMs = opts?.deadlineMs ?? Date.now() + 50_000;
  const since = new Date(Date.now() - sinceHours * 3_600_000);

  const checkpoint = await getJobCheckpoint(CHECKPOINT_JOB);
  const afterId = checkpoint?.cursor ?? null;

  const catalysts = await prisma.catalyst.findMany({
    where: {
      createdAt: { gte: since },
      ...(afterId ? { id: { gt: afterId } } : {}),
      OR: [
        { rawNewsId: { startsWith: "sec-10-q" } },
        { rawNewsId: { startsWith: "sec-10-k" } },
        { headline: { contains: "10-Q", mode: "insensitive" } },
        { headline: { contains: "10-K", mode: "insensitive" } },
      ],
    },
    orderBy: { id: "asc" },
    take: limit * 4,
    select: {
      id: true,
      symbol: true,
      headline: true,
      aiSummary: true,
      source: true,
      sourceUrl: true,
      rawNewsId: true,
      publishedAt: true,
    },
  });

  const candidates = catalysts.filter((c) =>
    shouldExtractFilingSections({
      source: c.source,
      rawNewsId: c.rawNewsId,
      headline: c.headline,
      summary: c.aiSummary,
    })
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let truncated = false;
  let lastId: string | null = afterId;
  let scanned = 0;

  const batch = candidates.slice(0, limit);

  await mapPool(batch, concurrency, async (c) => {
    if (Date.now() >= deadlineMs) {
      truncated = true;
      return;
    }
    scanned += 1;
    lastId = c.id;
    const accession = parseAccessionFromUrl(c.sourceUrl);
    if (accession) {
      const existing = await prisma.filingSectionSnapshot.count({
        where: { accessionNumber: accession },
      });
      if (existing >= 1) {
        skipped += 1;
        return;
      }
    }
    try {
      const r = await processCatalystForFilingSections({
        catalystId: c.id,
        symbol: c.symbol,
        headline: c.headline,
        summary: c.aiSummary,
        source: c.source,
        sourceUrl: c.sourceUrl,
        rawNewsId: c.rawNewsId,
        publishedAt: c.publishedAt,
      });
      if (r.processed > 0) processed += 1;
      else skipped += 1;
    } catch {
      // One issuer/provider failure must not kill the batch.
      failed += 1;
    }
  });

  // Wrap when we drained the window.
  const nextCursor =
    batch.length === 0 || (candidates.length < limit * 4 && !truncated)
      ? null
      : lastId;

  await setJobCheckpoint(CHECKPOINT_JOB, {
    cursor: nextCursor,
    meta: { scanned, processed, skipped, failed, truncated },
  });

  return { scanned, processed, skipped, failed, truncated };
}
