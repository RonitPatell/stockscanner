import {
  ingestWireBurst,
  ingestAndAnalyzeNews,
  refreshPublicFeedCache,
} from "./catalyst-engine";
import { refreshQuoteCache } from "./quote-cache-service";
import { getCachedFeed } from "./feed-cache";

export interface IngestPipelineResult {
  wireNew: number;
  fullNew: number;
  feedAll: number;
  feedMovers: number;
  quotesUpdated: number;
  finishedAt: string;
}

/** Single writer pipeline — run from cron/worker only. */
export async function runIngestPipeline(): Promise<IngestPipelineResult> {
  const wire = await ingestWireBurst();
  const full = await ingestAndAnalyzeNews({ fast: false });

  await refreshPublicFeedCache();

  const { items: allItems } = await getCachedFeed("all");
  const symbols = allItems.map((c) => c.symbol);
  const quotesUpdated = await refreshQuoteCache(symbols);

  await refreshPublicFeedCache();

  const all = await getCachedFeed("all");
  const movers = await getCachedFeed("movers");

  return {
    wireNew: wire.length,
    fullNew: full.length,
    feedAll: all.items.length,
    feedMovers: movers.items.length,
    quotesUpdated,
    finishedAt: new Date().toISOString(),
  };
}
