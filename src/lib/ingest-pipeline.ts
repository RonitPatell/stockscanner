import {
  ingestWireBurst,
  ingestAndAnalyzeNews,
  refreshPublicFeedCache,
} from "./catalyst-engine";
import { refreshQuoteCache } from "./quote-cache-service";
import { getCachedFeed } from "./feed-cache";
import { scanMarketActivity } from "./market-scanner";

export interface WirePipelineResult {
  wireNew: number;
  feedAll: number;
  feedMovers: number;
  finishedAt: string;
}

export interface IngestPipelineResult {
  fullNew: number;
  feedAll: number;
  feedMovers: number;
  quotesUpdated: number;
  finishedAt: string;
}

/** Fast wire path — headline insert + immediate feed cache refresh. */
export async function runWirePipeline(): Promise<WirePipelineResult> {
  const wire = await ingestWireBurst();

  // Redis TTL can expire while every headline is already in DB (wireNew=0).
  // Rebuild from DB so the public feed never stays empty in scale mode.
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
  };
}

/** Heavier full ingest — movers scan, quote refresh; does not block wire ticks. */
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
  const full = await ingestAndAnalyzeNews({ fast: true });

  await refreshPublicFeedCache();

  const { items: allItems } = await getCachedFeed("all");
  const symbols = allItems.map((c) => c.symbol);
  const quotesUpdated = await refreshQuoteCache(symbols);

  await refreshPublicFeedCache();

  // Keep wire-alert snapshot warm for instant dashboard SSR
  void scanMarketActivity(symbols.slice(0, 30)).catch(() => {});

  const all = await getCachedFeed("all");
  const movers = await getCachedFeed("movers");

  return {
    fullNew: full.newCount,
    feedAll: all.items.length,
    feedMovers: movers.items.length,
    quotesUpdated,
    finishedAt: new Date().toISOString(),
  };
}
