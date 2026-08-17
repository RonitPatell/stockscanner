/**
 * Incremental SEC companyfacts → MetricObservation for Vercel cron.
 * One slow issuer cannot exhaust the whole tick (mapPool + deadline).
 */

import { prisma } from "../prisma.ts";
import { getJobCheckpoint, setJobCheckpoint } from "../cost/job-checkpoint.ts";
import { mapPool } from "../cost/map-pool.ts";
import { fetchCompanyfacts } from "./companyfacts.ts";
import { ingestCompanyfactsMetrics } from "./pipeline.ts";

const CHECKPOINT_JOB = "cron:metrics-companyfacts";

export async function runMetricsCompanyfactsCron(opts?: {
  limit?: number;
  concurrency?: number;
  deadlineMs?: number;
}): Promise<{
  scanned: number;
  upserted: number;
  failed: number;
  skipped: number;
  truncated: boolean;
}> {
  const limit = Math.min(24, Math.max(1, opts?.limit ?? 8));
  const concurrency = Math.min(3, Math.max(1, opts?.concurrency ?? 2));
  const deadlineMs = opts?.deadlineMs ?? Date.now() + 50_000;

  const checkpoint = await getJobCheckpoint(CHECKPOINT_JOB);
  const afterSymbol = (checkpoint?.cursor ?? "").toUpperCase();

  const portfolio = await prisma.portfolioItem.findMany({
    where: { archivedAt: null },
    distinct: ["symbol"],
    orderBy: { symbol: "asc" },
    take: 400,
    select: { symbol: true, cik: true },
  });

  const coverage = await prisma.symbolCoverage.findMany({
    where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    distinct: ["symbol"],
    orderBy: { symbol: "asc" },
    take: 400,
    select: { symbol: true },
  });

  const bySym = new Map<string, string | null>();
  for (const p of portfolio) {
    bySym.set(p.symbol.toUpperCase(), p.cik ?? null);
  }
  for (const c of coverage) {
    const s = c.symbol.toUpperCase();
    if (!bySym.has(s)) bySym.set(s, null);
  }

  let symbols = [...bySym.keys()].sort();
  if (afterSymbol) {
    const idx = symbols.findIndex((s) => s > afterSymbol);
    symbols = idx >= 0 ? symbols.slice(idx) : symbols;
  }

  if (symbols.length === 0) {
    await setJobCheckpoint(CHECKPOINT_JOB, {
      cursor: null,
      meta: { wrapped: true },
    });
    return { scanned: 0, upserted: 0, failed: 0, skipped: 0, truncated: false };
  }

  const batch = symbols.slice(0, limit);
  const masters = await prisma.symbolMaster.findMany({
    where: { symbol: { in: batch } },
    select: { symbol: true, cik: true },
  });
  const cikBySym = new Map(masters.map((m) => [m.symbol, m.cik]));

  let truncated = false;
  const results = await mapPool(batch, concurrency, async (symbol) => {
    if (Date.now() >= deadlineMs) {
      truncated = true;
      return { symbol, status: "deadline" as const, upserted: 0 };
    }
    const cik = bySym.get(symbol) || cikBySym.get(symbol) || null;
    if (!cik) {
      return { symbol, status: "skipped" as const, upserted: 0 };
    }
    try {
      const doc = await fetchCompanyfacts(cik);
      if (!doc) {
        return { symbol, status: "skipped" as const, upserted: 0 };
      }
      const r = await ingestCompanyfactsMetrics({
        symbol,
        doc,
        cik,
        persist: true,
      });
      return { symbol, status: "ok" as const, upserted: r.upserted };
    } catch {
      return { symbol, status: "failed" as const, upserted: 0 };
    }
  });

  let upserted = 0;
  let failed = 0;
  let skipped = 0;
  let lastDone: string | null = afterSymbol || null;
  for (const r of results) {
    if (r.status === "ok") upserted += r.upserted;
    else if (r.status === "failed") failed += 1;
    else skipped += 1;
    if (r.status !== "deadline") lastDone = r.symbol;
  }

  // Wrap cursor when we finished the sorted universe.
  const finishedUniverse =
    !truncated && batch.length > 0 && batch[batch.length - 1] === symbols[symbols.length - 1];

  await setJobCheckpoint(CHECKPOINT_JOB, {
    cursor: finishedUniverse ? null : lastDone,
    meta: {
      upserted,
      failed,
      skipped,
      scanned: batch.length,
      truncated,
    },
  });

  return {
    scanned: batch.length,
    upserted,
    failed,
    skipped,
    truncated,
  };
}
