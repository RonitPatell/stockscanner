import { prisma } from "../prisma.ts";
import {
  dequeueAlertJob,
  ackAlertJob,
  failAlertJob,
  recoverProcessingJobs,
} from "./queues.ts";
import { upsertAlertEventVersion } from "./events.ts";
import { acquireDistributedLock, releaseDistributedLock } from "./locks.ts";
import { ALERT_QUEUE_CLASSES } from "./types.ts";
import type { AlertQueueClass, QueueJob } from "./types.ts";
import { getCachedQuotes } from "../quote-cache-service.ts";
import { estimateHistoricalMove } from "../market-data.ts";
import { detectSetupTags } from "../setup-tags.ts";
import { getMarketPhase } from "../ingest/schedule.ts";

function isPremarketHours(): boolean {
  return getMarketPhase() === "premarket";
}

export interface DrainResult {
  queue: AlertQueueClass;
  processed: number;
  succeeded: number;
  failed: number;
  recovered: number;
}

/** Drain one queue under a distributed lock. */
export async function drainQueue(
  queue: AlertQueueClass,
  opts: { maxJobs?: number } = {}
): Promise<DrainResult> {
  const maxJobs = opts.maxJobs ?? 25;
  const lock = await acquireDistributedLock(`drain:${queue}`, 45_000);
  if (!lock.acquired || !lock.token) {
    return { queue, processed: 0, succeeded: 0, failed: 0, recovered: 0 };
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let recovered = 0;

  try {
    recovered = await recoverProcessingJobs(queue, 90_000);

    while (processed < maxJobs) {
      const job = await dequeueAlertJob(queue);
      if (!job) break;
      processed++;
      try {
        await processJob(job);
        await ackAlertJob(queue, job.id);
        succeeded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await failAlertJob(job, msg);
        failed++;
      }
    }
  } finally {
    await releaseDistributedLock(`drain:${queue}`, lock.token);
  }

  return { queue, processed, succeeded, failed, recovered };
}

export async function drainAllQueues(
  opts: { maxJobsPerQueue?: number } = {}
): Promise<DrainResult[]> {
  // Primary first, enrichment last
  const order: AlertQueueClass[] = [
    "primary_filings",
    "licensed_news",
    "market_events",
    "editorial_news",
    "enrichment",
  ];
  const results: DrainResult[] = [];
  for (const q of order) {
    if (!ALERT_QUEUE_CLASSES.includes(q)) continue;
    results.push(await drainQueue(q, { maxJobs: opts.maxJobsPerQueue ?? 25 }));
  }
  return results;
}

async function processJob(job: QueueJob): Promise<void> {
  const { envelope } = job;
  if (envelope.queue === "enrichment" || envelope.phase === "preliminary") {
    if (envelope.enrichmentHints?.needsQuote || envelope.enrichmentHints?.needsHistorical) {
      await enrichCatalyst(envelope.catalystId, envelope.symbol, envelope);
    }
  }
  // Gap backfill / market markers: no-op success (ingest runner does real fetch)
  if (envelope.source === "synthetic_probe") return;
}

async function enrichCatalyst(
  catalystId: string,
  symbol: string,
  envelope: QueueJob["envelope"]
): Promise<void> {
  if (catalystId.startsWith("synthetic:")) return;

  const quotes = await getCachedQuotes([symbol]);
  const q = quotes[symbol];
  const row = await prisma.catalyst.findUnique({
    where: { id: catalystId },
    select: { catalystType: true },
  });
  const historical = estimateHistoricalMove(row?.catalystType ?? "other");

  const setupTags = q
    ? detectSetupTags({
        symbol,
        changePercent: q.changePercent,
        rVol: q.avgVolume && q.volume ? q.volume / Math.max(q.avgVolume, 1) : undefined,
        catalystType: undefined,
        relatedSymbols: [],
        isPremarket: isPremarketHours(),
      })
    : [];

  await prisma.catalyst
    .update({
      where: { id: catalystId },
      data: {
        ...(q?.price != null
          ? {
              price: q.price,
              changePercent: q.changePercent,
              floatShares: q.floatShares ?? undefined,
              marketCap: q.marketCap ?? undefined,
              volume: q.volume ?? undefined,
              avgVolume: q.avgVolume ?? undefined,
            }
          : {}),
        ...(historical.avgMove != null
          ? {
              historicalAvgMove: historical.avgMove,
              historicalSampleSize: historical.sampleSize,
            }
          : {}),
        ...(setupTags.length ? { setupTags } : {}),
      },
    })
    .catch(() => {});

  await upsertAlertEventVersion({
    eventId: envelope.eventId,
    queue: envelope.queue,
    catalystId,
    rawNewsId: envelope.rawNewsId,
    symbol,
    headline: envelope.headline,
    source: envelope.source,
    sourceTier: envelope.sourceTier,
    publishedAt: envelope.publishedAt,
    timestampQuality: envelope.timestampQuality,
    providerTimestampUnreliable: envelope.providerTimestampUnreliable,
    phase: "enriched",
  });
}
