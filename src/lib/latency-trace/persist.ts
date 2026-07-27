import { prisma } from "../prisma.ts";
import { classifyMetricCohort } from "./cohorts.ts";
import { getSourceTier } from "../source-trust.ts";
import { marketSessionAt, urlHash } from "./timestamps.ts";
import { computeLatencyTotals } from "./totals.ts";
import type { NewsArticleTraceMeta, TimestampQuality } from "./types.ts";

export { computeLatencyTotals } from "./totals.ts";

export interface RecordLatencyTraceInput {
  catalystId: string;
  source: string;
  sourceTier?: string | null;
  providerItemId?: string | null;
  url?: string | null;
  symbol: string;
  catalystType?: string | null;
  headline: string;
  summary?: string | null;
  relatedSymbols?: string[] | null;
  timestampQuality: TimestampQuality;
  providerPublishedAt?: Date | null;
  firstFetchedAt?: Date | null;
  fetchCompletedAt?: Date | null;
  parsedAt?: Date | null;
  classifiedAt?: Date | null;
  persistedAt: Date;
  trace?: NewsArticleTraceMeta | null;
}

/** Persist a new latency trace for a freshly created catalyst (best-effort). */
export async function recordLatencyTrace(
  input: RecordLatencyTraceInput
): Promise<void> {
  try {
    const quality = input.timestampQuality;
    const providerPublishedAt =
      input.providerPublishedAt ?? input.trace?.providerPublishedAt ?? null;
    const firstFetchedAt = input.firstFetchedAt ?? input.trace?.firstFetchedAt ?? null;
    const fetchCompletedAt =
      input.fetchCompletedAt ?? input.trace?.fetchCompletedAt ?? null;
    const parsedAt = input.parsedAt ?? input.trace?.parsedAt ?? null;
    const classifiedAt = input.classifiedAt ?? null;
    const persistedAt = input.persistedAt;

    const { metricCohort, actionable } = classifyMetricCohort({
      catalystType: input.catalystType,
      headline: input.headline,
      summary: input.summary,
      source: input.source,
      relatedSymbols: input.relatedSymbols,
      providerItemId: input.providerItemId,
    });

    const totals = computeLatencyTotals({
      providerPublishedAt,
      firstFetchedAt,
      fetchCompletedAt,
      classifiedAt,
      persistedAt,
    });

    const sessionAt = providerPublishedAt ?? persistedAt;

    await prisma.latencyTrace.upsert({
      where: { catalystId: input.catalystId },
      create: {
        catalystId: input.catalystId,
        source: input.source,
        sourceTier: input.sourceTier ?? getSourceTier(input.source),
        providerItemId: input.providerItemId ?? input.trace?.providerItemId ?? null,
        urlHash: urlHash(input.url),
        symbol: input.symbol,
        catalystType: input.catalystType ?? null,
        headline: input.headline.slice(0, 280),
        actionable,
        metricCohort,
        timestampQuality: quality,
        marketSession: marketSessionAt(sessionAt),
        providerPublishedAt,
        firstFetchedAt,
        fetchCompletedAt,
        parsedAt,
        classifiedAt,
        persistedAt,
        fetchLatencyMs: totals.fetchLatencyMs,
        processingLatencyMs: totals.processingLatencyMs,
        deliveryLatencyMs: totals.deliveryLatencyMs,
        totalLatencyMs: totals.totalLatencyMs,
      },
      update: {
        // Never overwrite an existing create row's core timestamps on re-ingest.
        catalystType: input.catalystType ?? null,
        actionable,
        metricCohort,
      },
    });
  } catch (err) {
    console.error("latency-trace persist failed:", err instanceof Error ? err.message : err);
  }
}

/** Mark feed-cache publish time (SSE becomes eligible). */
export async function markTracesSsePublished(
  catalystIds: string[],
  at = new Date()
): Promise<void> {
  if (catalystIds.length === 0) return;
  try {
    const pending = await prisma.latencyTrace.findMany({
      where: {
        catalystId: { in: catalystIds },
        ssePublishedAt: null,
      },
      select: {
        id: true,
        persistedAt: true,
        providerPublishedAt: true,
        firstFetchedAt: true,
        fetchCompletedAt: true,
        classifiedAt: true,
      },
    });
    if (pending.length === 0) return;

    await Promise.all(
      pending.map((row) => {
        const totals = computeLatencyTotals({
          providerPublishedAt: row.providerPublishedAt,
          firstFetchedAt: row.firstFetchedAt,
          fetchCompletedAt: row.fetchCompletedAt,
          classifiedAt: row.classifiedAt,
          persistedAt: row.persistedAt,
          ssePublishedAt: at,
        });
        return prisma.latencyTrace.update({
          where: { id: row.id },
          data: {
            ssePublishedAt: at,
            deliveryLatencyMs: totals.deliveryLatencyMs,
            totalLatencyMs: totals.totalLatencyMs,
          },
        });
      })
    );
  } catch (err) {
    console.error("latency-trace sse mark failed:", err instanceof Error ? err.message : err);
  }
}

/** Mark first SSE/client delivery attempt. */
export async function markTracesFirstDelivery(
  catalystIds: string[],
  at = new Date()
): Promise<void> {
  if (catalystIds.length === 0) return;
  try {
    const pending = await prisma.latencyTrace.findMany({
      where: {
        catalystId: { in: catalystIds },
        firstDeliveryAttemptAt: null,
      },
      select: {
        id: true,
        persistedAt: true,
        providerPublishedAt: true,
        firstFetchedAt: true,
        fetchCompletedAt: true,
        classifiedAt: true,
        ssePublishedAt: true,
      },
    });
    if (pending.length === 0) return;

    await Promise.all(
      pending.map((row) => {
        const ssePublishedAt = row.ssePublishedAt ?? at;
        const totals = computeLatencyTotals({
          providerPublishedAt: row.providerPublishedAt,
          firstFetchedAt: row.firstFetchedAt,
          fetchCompletedAt: row.fetchCompletedAt,
          classifiedAt: row.classifiedAt,
          persistedAt: row.persistedAt,
          ssePublishedAt,
          firstDeliveryAttemptAt: at,
        });
        return prisma.latencyTrace.update({
          where: { id: row.id },
          data: {
            ssePublishedAt: row.ssePublishedAt ?? at,
            firstDeliveryAttemptAt: at,
            deliveryLatencyMs: totals.deliveryLatencyMs,
            totalLatencyMs: totals.totalLatencyMs,
          },
        });
      })
    );
  } catch (err) {
    console.error(
      "latency-trace delivery mark failed:",
      err instanceof Error ? err.message : err
    );
  }
}
