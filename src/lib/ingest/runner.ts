import { annotateFetchedArticles } from "../latency-trace/annotate.ts";
import { getCircuitState, recordCircuitFailure, recordCircuitSuccess } from "./circuit.ts";
import { pushDeadLetter } from "./dlq.ts";
import { isIngestDraining } from "./drain.ts";
import { isSourceFlagEnabled } from "./flags.ts";
import { recordSourceFailure, recordSourceSuccess } from "./health.ts";
import { filterFreshArticles } from "./idempotency-store.ts";
import { acquirePartitionLock, releasePartitionLock } from "./lock.ts";
import { acquireProviderPermit } from "./provider-rate.ts";
import { getMarketPhase, intervalForPhase } from "./schedule.ts";
import { fetchSourceArticles, getSourceById, sourcesForTier } from "./sources.ts";
import type { IngestTier, SourceDefinition, TierRunResult } from "./types.ts";
import type { NewsArticle } from "../../types/index.ts";

export interface SourceTickResult {
  sourceId: string;
  status: "ok" | "skipped" | "failed" | "lock_busy" | "draining";
  reason?: string;
  articles: NewsArticle[];
  responseMs?: number;
}

const lastRunAt = new Map<string, number>();

function dueForPoll(def: SourceDefinition, now = Date.now()): boolean {
  const last = lastRunAt.get(def.id) ?? 0;
  const interval = intervalForPhase(def.intervals, getMarketPhase(new Date(now)));
  return now - last >= interval;
}

/** Run a single source under lock + rate limit + circuit breaker. */
export async function runSourceTick(
  def: SourceDefinition,
  opts: { force?: boolean } = {}
): Promise<SourceTickResult> {
  if (await isIngestDraining()) {
    return { sourceId: def.id, status: "draining", articles: [] };
  }
  if (!isSourceFlagEnabled(def)) {
    return {
      sourceId: def.id,
      status: "skipped",
      reason: "feature_flag_disabled",
      articles: [],
    };
  }
  if (!opts.force && !dueForPoll(def)) {
    return {
      sourceId: def.id,
      status: "skipped",
      reason: "not_due",
      articles: [],
    };
  }

  const circuit = await getCircuitState(def.provider, def.circuit);
  if (!circuit.allow) {
    return {
      sourceId: def.id,
      status: "skipped",
      reason: `circuit_${circuit.state}`,
      articles: [],
    };
  }

  const permit = await acquireProviderPermit(def.provider, def.rateLimit);
  if (!permit.ok) {
    return {
      sourceId: def.id,
      status: "skipped",
      reason: "rate_limited",
      articles: [],
    };
  }

  const lock = await acquirePartitionLock(def.partition, 60_000);
  if (!lock.acquired || !lock.token) {
    return { sourceId: def.id, status: "lock_busy", articles: [] };
  }

  const started = Date.now();
  const firstFetchedAt = new Date(started);
  try {
    lastRunAt.set(def.id, started);
    let articles = await fetchSourceArticles(def.id);
    const fetchCompletedAt = new Date();
    articles = annotateFetchedArticles(articles, {
      firstFetchedAt,
      fetchCompletedAt,
    });

    // Drop stale (>24h) and malformed timestamps
    const cutoff = Date.now() - 24 * 60 * 60_000;
    articles = articles.filter((a) => {
      const t = a.publishedAt?.getTime?.() ?? NaN;
      if (!Number.isFinite(t)) return false;
      if (t < cutoff) return false;
      if (a.trace?.timestampQuality === "INVALID") return false;
      return true;
    });

    articles = await filterFreshArticles(articles);
    const responseMs = Date.now() - started;

    await recordCircuitSuccess(def.provider);
    await recordSourceSuccess({
      sourceId: def.id,
      responseMs,
      itemsReceived: articles.length,
    });

    void (async () => {
      try {
        const { detectAndBackfillGap } = await import("../alert-backbone/gap-backfill");
        const cursor =
          articles[0]?.id ??
          articles[0]?.publishedAt?.toISOString?.() ??
          String(Date.now());
        await detectAndBackfillGap({
          sourceId: def.id,
          provider: def.provider,
          newCursor: cursor,
          expectedIntervalMs: intervalForPhase(def.intervals),
          connectionMode: "poll",
        });
      } catch {
        /* non-fatal */
      }
    })();

    return {
      sourceId: def.id,
      status: "ok",
      articles,
      responseMs,
    };
  } catch (err) {
    const responseMs = Date.now() - started;
    const message = err instanceof Error ? err.message : "source_fetch_failed";
    const rec = await recordCircuitFailure(def.provider, def.circuit);
    await recordSourceFailure({
      sourceId: def.id,
      responseMs,
      error: message,
      consecutiveFailures: rec.consecutiveFailures,
      circuit: rec.state,
      nextEligibleAt: rec.nextEligibleAt,
    });
    await pushDeadLetter({
      sourceId: def.id,
      tier: def.tier,
      error: message,
      attempt: rec.consecutiveFailures,
      payloadSummary: `provider=${def.provider}`,
    });
    return {
      sourceId: def.id,
      status: "failed",
      reason: message,
      articles: [],
      responseMs,
    };
  } finally {
    await releasePartitionLock(def.partition, lock.token);
  }
}

/** Process all sources in a tier (separate queue / schedule). */
export async function runTierIngest(
  tier: IngestTier,
  opts: { force?: boolean; ingestArticles?: (articles: NewsArticle[]) => Promise<number> } = {}
): Promise<TierRunResult> {
  const sources = sourcesForTier(tier);
  let sourcesAttempted = 0;
  let sourcesSucceeded = 0;
  let sourcesSkipped = 0;
  let sourcesFailed = 0;
  let lockContention = 0;
  let articlesFetched = 0;
  let articlesIngested = 0;

  const collected: NewsArticle[] = [];

  for (const def of sources) {
    const tick = await runSourceTick(def, { force: opts.force });
    if (tick.status === "lock_busy") {
      lockContention += 1;
      sourcesSkipped += 1;
      continue;
    }
    if (tick.status === "skipped" || tick.status === "draining") {
      sourcesSkipped += 1;
      continue;
    }
    sourcesAttempted += 1;
    if (tick.status === "failed") {
      sourcesFailed += 1;
      continue;
    }
    sourcesSucceeded += 1;
    articlesFetched += tick.articles.length;
    collected.push(...tick.articles);
  }

  if (collected.length > 0 && opts.ingestArticles) {
    articlesIngested = await opts.ingestArticles(collected);
  }

  return {
    tier,
    sourcesAttempted,
    sourcesSucceeded,
    sourcesSkipped,
    sourcesFailed,
    articlesFetched,
    articlesIngested,
    lockContention,
    finishedAt: new Date().toISOString(),
  };
}

/** Admin retry: force-run one source from DLQ / health panel. */
export async function retrySourceById(sourceId: string): Promise<SourceTickResult> {
  const def = getSourceById(sourceId);
  if (!def) {
    return {
      sourceId,
      status: "failed",
      reason: "unknown_source",
      articles: [],
    };
  }
  return runSourceTick(def, { force: true });
}

export function __resetLastRunForTests(): void {
  lastRunAt.clear();
}
