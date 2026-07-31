import {
  ingestAndAnalyzeNews,
  ingestWireBurst,
  refreshPublicFeedCache,
} from "./catalyst-engine";
import { refreshQuoteCache } from "./quote-cache-service";
import { getCachedFeed } from "./feed-cache";
import { scanMarketActivity } from "./market-scanner";
import { isPriorityIngestEnabled } from "./ingest/flags";
import { runTierIngest } from "./ingest/runner";
import type { IngestTier, TierRunResult } from "./ingest/types";
import type { NewsArticle } from "@/types";

export interface WirePipelineResult {
  wireNew: number;
  feedAll: number;
  feedMovers: number;
  finishedAt: string;
  tiers?: TierRunResult[];
  mode?: "priority" | "legacy";
}

export interface IngestPipelineResult {
  fullNew: number;
  feedAll: number;
  feedMovers: number;
  quotesUpdated: number;
  finishedAt: string;
  tiers?: TierRunResult[];
  mode?: "priority" | "legacy";
}

async function ensureFeedCacheWarm(): Promise<void> {
  const cached = await getCachedFeed("all");
  if (cached.items.length === 0) {
    await refreshPublicFeedCache();
  }
}

async function ingestCollected(
  articles: NewsArticle[],
  wireOnly: boolean
): Promise<number> {
  if (articles.length === 0) {
    await ensureFeedCacheWarm();
    return 0;
  }
  const batch = await ingestAndAnalyzeNews({
    wireOnly,
    articles,
    fast: true,
  });
  if (batch.newCount > 0) {
    await refreshPublicFeedCache();
  } else {
    // Restart / empty memory cache: rebuild from DB even when every article was a dupe
    await ensureFeedCacheWarm();
  }
  return batch.newCount;
}

/**
 * Fast path — Tier 0 (SEC + issuer wires) + Tier 1 (Finnhub / Yahoo / editorial RSS).
 * Preserves WirePipelineResult shape for cron/worker compatibility.
 */
export async function runWirePipeline(): Promise<WirePipelineResult> {
  if (!isPriorityIngestEnabled()) {
    const wire = await ingestWireBurst();
    let all = await getCachedFeed("all");
    if (all.items.length === 0) {
      await refreshPublicFeedCache();
      all = await getCachedFeed("all");
    }
    const movers = await getCachedFeed("movers");
    return {
      wireNew: wire.newCount,
      feedAll: all.items.length,
      feedMovers: movers.items.length,
      finishedAt: new Date().toISOString(),
      mode: "legacy",
    };
  }

  const tiers: TierRunResult[] = [];
  let wireNew = 0;

  for (const tier of [0, 1] as IngestTier[]) {
    const result = await runTierIngest(tier, {
      ingestArticles: (articles) => ingestCollected(articles, true),
    });
    tiers.push(result);
    wireNew += result.articlesIngested;
  }

  let all = await getCachedFeed("all");
  if (all.items.length === 0) {
    await refreshPublicFeedCache();
    all = await getCachedFeed("all");
  }
  const movers = await getCachedFeed("movers");

  return {
    wireNew,
    feedAll: all.items.length,
    feedMovers: movers.items.length,
    finishedAt: new Date().toISOString(),
    tiers,
    mode: "priority",
  };
}

/** Heavier path — Tier 2 + Tier 3, then quotes / feed rebuild. */
export async function runIngestPipeline(): Promise<IngestPipelineResult> {
  const PIPELINE_TIMEOUT_MS = 4 * 60_000;
  return Promise.race([
    runIngestPipelineInner(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Ingest pipeline timed out")), PIPELINE_TIMEOUT_MS)
    ),
  ]);
}

async function runIngestPipelineInner(): Promise<IngestPipelineResult> {
  if (!isPriorityIngestEnabled()) {
    const full = await ingestAndAnalyzeNews({ fast: true });
    await refreshPublicFeedCache();
    const { items: allItems } = await getCachedFeed("all");
    const quotesUpdated = await refreshQuoteCache(allItems.map((c) => c.symbol));
    await refreshPublicFeedCache();
    void scanMarketActivity(allItems.map((c) => c.symbol).slice(0, 30)).catch(() => {});
    const all = await getCachedFeed("all");
    const movers = await getCachedFeed("movers");
    return {
      fullNew: full.newCount,
      feedAll: all.items.length,
      feedMovers: movers.items.length,
      quotesUpdated,
      finishedAt: new Date().toISOString(),
      mode: "legacy",
    };
  }

  const tiers: TierRunResult[] = [];
  let fullNew = 0;

  for (const tier of [2, 3] as IngestTier[]) {
    const result = await runTierIngest(tier, {
      ingestArticles: (articles) => ingestCollected(articles, false),
    });
    tiers.push(result);
    fullNew += result.articlesIngested;
  }

  await refreshPublicFeedCache();

  const { items: allItems } = await getCachedFeed("all");
  const symbols = allItems.map((c) => c.symbol);
  const quotesUpdated = await refreshQuoteCache(symbols);
  await refreshPublicFeedCache();
  void scanMarketActivity(symbols.slice(0, 30)).catch(() => {});

  const all = await getCachedFeed("all");
  const movers = await getCachedFeed("movers");

  return {
    fullNew,
    feedAll: all.items.length,
    feedMovers: movers.items.length,
    quotesUpdated,
    finishedAt: new Date().toISOString(),
    tiers,
    mode: "priority",
  };
}

/** Single-tier tick for the priority worker. */
export async function runPriorityTierTick(
  tier: IngestTier
): Promise<TierRunResult> {
  const wireOnly = tier <= 1;
  const result = await runTierIngest(tier, {
    ingestArticles: (articles) => ingestCollected(articles, wireOnly),
  });
  // Tier-0 is the heartbeat — keep the public feed warm after each wake
  if (tier === 0) await ensureFeedCacheWarm();
  return result;
}
