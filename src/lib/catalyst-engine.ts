import { prisma } from "./prisma";
import { analyzeNews } from "./ai";
import {
  fetchMarketNews,
  fetchFastWireNews,
  fetchUltraFastWireNews,
  fetchExtendedWireNews,
  fetchQuote,
  fetchQuoteTrusted,
  fetchQuoteLive,
  estimateHistoricalMove,
  isPlaceholderQuote,
  isValidTickerFormat,
  isTrustedNewsSource,
} from "./market-data";
import { computeRvol } from "./volume-utils";
import { verifyNewsArticle, isRoundupArticle, isLikelyStockNews, isKnownFalsePositive, articleIsAboutSymbol } from "./news-verifier";
import { isMoverCatalyst, sortByRecency } from "./movers";
import { dispatchWatchlistAlerts } from "./watchlist-alerts";
import { storyClusterKey, attachStoryClusters } from "./story-cluster";
import { detectSetupTags } from "./setup-tags";
import { getSourceTier } from "./source-trust";
import { isScaleMode } from "./redis";
import { getCachedFeed, setCachedFeed, type FeedCacheKey } from "./feed-cache";
import {
  getCachedQuotes,
  mergeQuotesIntoFeed,
  refreshQuoteCache,
} from "./quote-cache-service";
import type { CatalystItem } from "@/types";
import type { NewsArticle } from "@/types";
import { getPriorityTickers } from "./priority-tickers";

let lastIngestTime = 0;
let lastPurgeTime = 0;
let ingestInProgress = false;
let ingestErrorStreak = 0;

// Prevent feed flicker: if a poll hits a transient DB error, return last known good data
const lastGood = new Map<"all" | "movers", { ts: number; items: CatalystItem[] }>();
const LAST_GOOD_TTL_MS = 3 * 60 * 1000;

const WIRE_BURST_MS = 3_000;
const FULL_INGEST_MS = 45_000;
const MAX_NEW_INGEST_PER_CYCLE = 30;
const MAX_WIRE_BURST_NEW = 40;
const INGEST_SCAN_WINDOW = 150;
const MAX_CATALYSTS_SHOWN = 300;
const MAX_NEWS_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_NEWS_MS = 45 * 60 * 1000;
const FEED_CACHE_MS = isScaleMode() ? 1_500 : 2_500;

/** Stock-impact news only — blocks lifestyle PR and false ticker matches */
function isDisplayableCatalyst(c: CatalystItem): boolean {
  if (!isValidTickerFormat(c.symbol)) return false;
  if (!isLikelyStockNews(c.headline, c.aiSummary ?? undefined)) return false;
  if (!articleIsAboutSymbol(c.symbol, c.headline, c.aiSummary ?? undefined)) return false;
  if (isKnownFalsePositive(c.symbol, c.headline, c.aiSummary ?? undefined)) return false;
  if (Date.now() - new Date(c.publishedAt).getTime() > MAX_NEWS_AGE_MS) return false;
  const hasPrice =
    c.price != null && !isPlaceholderQuote(c.price, c.changePercent);
  const isRecent =
    Date.now() - new Date(c.publishedAt).getTime() <= RECENT_NEWS_MS;
  return hasPrice || isRecent;
}

function isFastSourceArticle(article: { id: string; source: string }): boolean {
  return (
    article.id.startsWith("globe-") ||
    article.id.startsWith("bw-") ||
    article.id.startsWith("prn-") ||
    article.id.startsWith("rss-") ||
    article.id.startsWith("fh-") ||
    article.id.startsWith("yh-") ||
    isTrustedNewsSource(article.source)
  );
}

async function quoteWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number
): Promise<T | null> {
  return Promise.race([
    fn(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function resolveIngestQuote(
  symbol: string,
  articleId: string,
  source: string,
  wireOnly: boolean,
  getQuote: (symbol: string, articleId: string, source: string) => Promise<Awaited<ReturnType<typeof fetchQuote>> | null>
): Promise<Awaited<ReturnType<typeof fetchQuote>> | null> {
  const cached = await getCachedQuotes([symbol]);
  const hit = cached[symbol];
  if (hit && hit.price > 0) {
    return {
      price: hit.price,
      changePercent: hit.changePercent,
      change: hit.change,
      floatShares: null,
      marketCap: null,
    };
  }

  const timeoutMs = wireOnly ? 2_500 : 2_000;
  const live =
    (await quoteWithTimeout(() => fetchQuoteLive(symbol), timeoutMs)) ??
    (wireOnly ? null : await getQuote(symbol, articleId, source));
  return live;
}

async function enrichItemsWithQuotes(items: CatalystItem[]): Promise<CatalystItem[]> {
  if (items.length === 0) return items;
  const symbols = [...new Set(items.map((c) => c.symbol))];
  let quotes = await getCachedQuotes(symbols);
  const missing = symbols.filter((s) => !quotes[s]?.price);
  if (missing.length > 0) {
    await refreshQuoteCache(missing.slice(0, 16));
    quotes = { ...(await getCachedQuotes(symbols)) };
  }
  return items.map((c) => {
    const q = quotes[c.symbol];
    if (!q?.price) return c;
    const enriched = { ...c, price: q.price, changePercent: q.changePercent };
    void prisma.catalyst
      .update({
        where: { id: c.id },
        data: { price: q.price, changePercent: q.changePercent },
      })
      .catch(() => {});
    return enriched;
  });
}

/** Only remove items older than 24h — never re-purge recent headlines */
async function purgeStaleCatalysts(): Promise<void> {
  try {
    await prisma.catalyst.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - MAX_NEWS_AGE_MS) } },
    });
  } catch {
    /* ignore */
  }
}

export interface IngestBatchResult {
  items: CatalystItem[];
  newCount: number;
  newItems: CatalystItem[];
}

export async function ingestAndAnalyzeNews(
  options: { fast?: boolean; wireOnly?: boolean; articles?: NewsArticle[] } = {}
): Promise<IngestBatchResult> {
  const wireOnly = options.wireOnly === true;
  const news =
    options.articles ??
    (wireOnly
      ? await fetchFastWireNews()
      : await fetchMarketNews({ fast: options.fast !== false }));
  const results: CatalystItem[] = [];
  const quoteCache = new Map<string, Awaited<ReturnType<typeof fetchQuote>>>();
  const cutoff = Date.now() - MAX_NEWS_AGE_MS;
  const wireRecentCutoff = Date.now() - 45 * 60 * 1000;
  const maxNew = wireOnly ? MAX_WIRE_BURST_NEW : MAX_NEW_INGEST_PER_CYCLE;
  const concurrency = wireOnly ? 15 : 5;

  const getQuote = async (symbol: string, articleId: string, source: string) => {
    const cached = quoteCache.get(symbol);
    if (cached !== undefined) return cached;
    const trusted =
      articleId.startsWith("fh-") ||
      articleId.startsWith("sec-") ||
      articleId.startsWith("globe-") ||
      articleId.startsWith("bw-") ||
      articleId.startsWith("prn-") ||
      articleId.startsWith("yh-") ||
      articleId.startsWith("rss-") ||
      isTrustedNewsSource(source);
    const q = trusted
      ? (await fetchQuoteTrusted(symbol)) ?? (await fetchQuote(symbol))
      : await fetchQuote(symbol);
    quoteCache.set(symbol, q);
    return q;
  };

  const backfillQuote = (symbol: string, rawNewsId: string) => {
    void (async () => {
      const q = (await fetchQuoteTrusted(symbol)) ?? (await fetchQuote(symbol));
      if (!q) return;
      await prisma.catalyst
        .updateMany({
          where: { rawNewsId },
          data: {
            price: q.price,
            changePercent: q.changePercent,
            floatShares: q.floatShares,
            marketCap: q.marketCap,
          },
        })
        .catch(() => {});
    })();
  };

  const ingestOne = async (article: NewsArticle): Promise<CatalystItem | null> => {
    if (!isLikelyStockNews(article.headline, article.summary)) return null;

    const verified = await verifyNewsArticle(
      article.headline,
      article.summary,
      undefined,
      article.symbol,
      {
        skipQuoteCheck:
          wireOnly ||
          isFastSourceArticle(article) ||
          article.id.startsWith("yh-") ||
          article.id.startsWith("sec-") ||
          article.source === "Yahoo Finance" ||
          article.source === "SEC EDGAR",
      }
    );
    if (!verified.valid) return null;

    const symbol = verified.symbol;
    if (!articleIsAboutSymbol(symbol, article.headline, article.summary)) return null;
    if (isKnownFalsePositive(symbol, article.headline, article.summary)) return null;

    const relatedSymbols = (verified.relatedSymbols ?? [])
      .filter((s) => s !== symbol)
      .slice(0, 10);

    const quote = await resolveIngestQuote(
      symbol,
      article.id,
      article.source,
      wireOnly,
      getQuote
    );

    const analysis = await analyzeNews(
      symbol,
      article.headline,
      article.source,
      article.summary
    );

    const historical = estimateHistoricalMove(analysis.catalystType);
    const catalystType =
      relatedSymbols.length >= 2 ? "macro" : analysis.catalystType;
    const clusterId = storyClusterKey(article.headline);
    const sourceTier = getSourceTier(article.source);
    const setupTags = quote
      ? detectSetupTags({
          symbol,
          changePercent: quote.changePercent,
          catalystType,
          relatedSymbols,
          isPremarket: isPremarketHours(),
        })
      : [];

    const catalystData = {
      symbol,
      headline: article.headline,
      source: article.source,
      sourceUrl: article.url,
      publishedAt: article.publishedAt,
      aiSummary: analysis.summary,
      sentimentScore: analysis.sentimentScore,
      sentimentLabel: analysis.sentimentLabel,
      catalystType,
      urgencyScore: analysis.urgencyScore,
      floatShares: quote?.floatShares ?? null,
      marketCap: quote?.marketCap ?? null,
      price: quote?.price ?? null,
      changePercent: quote?.changePercent ?? null,
      volume: null as number | null,
      avgVolume: null as number | null,
      historicalAvgMove: historical.avgMove,
      historicalSampleSize: historical.sampleSize,
      isPremarket: isPremarketHours(),
      relatedSymbols,
      storyClusterId: clusterId,
      setupTags,
      verifiedConfidence: verified.confidence,
      keyPoints: analysis.keyPoints,
      sourceTier,
    };

    const catalyst = await prisma.catalyst.upsert({
      where: { rawNewsId: article.id },
      create: { ...catalystData, rawNewsId: article.id },
      update: {
        relatedSymbols,
        catalystType,
        aiSummary: analysis.summary,
        sentimentScore: analysis.sentimentScore,
        sentimentLabel: analysis.sentimentLabel,
        urgencyScore: analysis.urgencyScore,
        ...(quote
          ? {
              price: quote.price,
              changePercent: quote.changePercent,
              floatShares: quote.floatShares,
              marketCap: quote.marketCap,
              setupTags,
            }
          : {}),
        keyPoints: analysis.keyPoints,
        verifiedConfidence: verified.confidence,
      },
    });

    if (!quote) backfillQuote(symbol, article.id);
    return mapCatalyst(catalyst);
  };

  const newItems: CatalystItem[] = [];
  const freshNews = news
    .filter((a) => a.publishedAt.getTime() >= cutoff)
    .filter((a) => !wireOnly || a.publishedAt.getTime() >= wireRecentCutoff)
    .slice(0, wireOnly ? 80 : INGEST_SCAN_WINDOW);

  const ids = freshNews.map((a) => a.id);
  const existingIdSet = new Set<string>();
  let existingByRawId = new Map<string, Parameters<typeof mapCatalyst>[0]>();

  if (wireOnly) {
    const existingIds = await prisma.catalyst.findMany({
      where: { rawNewsId: { in: ids } },
      select: { rawNewsId: true },
    });
    for (const row of existingIds) {
      if (row.rawNewsId) existingIdSet.add(row.rawNewsId);
    }
  } else {
    const existingRows = await prisma.catalyst.findMany({
      where: { rawNewsId: { in: ids } },
      select: {
        id: true,
        rawNewsId: true,
        symbol: true,
        relatedSymbols: true,
        catalystType: true,
        headline: true,
        source: true,
        sourceUrl: true,
        publishedAt: true,
        aiSummary: true,
        sentimentScore: true,
        sentimentLabel: true,
        floatShares: true,
        marketCap: true,
        price: true,
        changePercent: true,
        volume: true,
        avgVolume: true,
        isPremarket: true,
        historicalAvgMove: true,
        historicalSampleSize: true,
        urgencyScore: true,
        storyClusterId: true,
        setupTags: true,
        verifiedConfidence: true,
        keyPoints: true,
        sourceTier: true,
        createdAt: true,
      },
    });
    existingByRawId = new Map(
      existingRows
        .filter((r) => r.rawNewsId)
        .map((r) => [r.rawNewsId as string, r])
    );
    for (const id of existingByRawId.keys()) existingIdSet.add(id);
  }

  if (!wireOnly) {
    for (const article of freshNews.filter((a) => existingIdSet.has(a.id))) {
      const existing = existingByRawId.get(article.id)!;
      if (!existing.relatedSymbols || existing.relatedSymbols.length === 0) {
        try {
          const filled = await verifyNewsArticle(
            article.headline,
            article.summary,
            undefined,
            article.symbol ?? existing.symbol,
            { skipQuoteCheck: true }
          );
          const related = (filled.relatedSymbols ?? [])
            .filter((s) => s !== existing.symbol)
            .slice(0, 10);
          if (
            related.length > 0 &&
            (filled.isRoundup ||
              isRoundupArticle(article.headline, article.summary) ||
              related.length >= 2)
          ) {
            const updated = await prisma.catalyst.update({
              where: { id: existing.id },
              data: {
                relatedSymbols: related,
                catalystType:
                  related.length >= 2 ? "macro" : existing.catalystType,
              },
            });
            results.push(mapCatalyst(updated));
            continue;
          }
        } catch {
          /* keep existing row */
        }
      }
      results.push(mapCatalyst(existing));
    }
  }

  const unseen = freshNews
    .filter((a) => !existingIdSet.has(a.id))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, maxNew);

  for (let i = 0; i < unseen.length; i += concurrency) {
    const batch = unseen.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((article) =>
        ingestOne(article).catch(() => null)
      )
    );
    for (const item of batchResults) {
      if (!item) continue;
      results.push(item);
      newItems.push(item);
    }
  }

  lastIngestTime = Date.now();
  ingestErrorStreak = 0;

  if (newItems.length > 0) {
    const enriched = await enrichItemsWithQuotes(newItems);
    newItems.length = 0;
    newItems.push(...enriched);
    void dispatchWatchlistAlerts(newItems).catch(() => {});
  }

  const items = rankMovers(results.filter(isDisplayableCatalyst), false);
  return { items, newCount: newItems.length, newItems };
}

/** Wire + RSS burst — ultra-fast sources first, extended sources in background */
let extendedWireInFlight = false;

async function runExtendedWireIngest(): Promise<void> {
  if (extendedWireInFlight) return;
  extendedWireInFlight = true;
  try {
    const priority = await getPriorityTickers();
    const news = await fetchExtendedWireNews(priority);
    const batch = await ingestAndAnalyzeNews({
      fast: true,
      wireOnly: true,
      articles: news,
    });
    if (batch.newCount > 0) await prependToPublicFeedCache(batch.newItems);
  } catch {
    /* best effort */
  } finally {
    extendedWireInFlight = false;
  }
}

export async function ingestWireBurst(): Promise<IngestBatchResult> {
  const priority = await getPriorityTickers();
  const ultra = await fetchUltraFastWireNews(priority);
  const batch = await ingestAndAnalyzeNews({
    fast: true,
    wireOnly: true,
    articles: ultra,
  });
  if (batch.newCount > 0) {
    await prependToPublicFeedCache(batch.newItems);
  }
  void runExtendedWireIngest();
  return batch;
}

async function buildFeedFromDatabase(
  limit: number,
  moversOnly: boolean
): Promise<CatalystItem[]> {
  const cutoff = new Date(Date.now() - MAX_NEWS_AGE_MS);

  if (Date.now() - lastPurgeTime > 60 * 60_000) {
    await purgeStaleCatalysts();
    lastPurgeTime = Date.now();
  }

  const catalysts = await prisma.catalyst.findMany({
    where: { publishedAt: { gte: cutoff } },
    orderBy: { publishedAt: "desc" },
    take: Math.min(limit * 2, 400),
  });

  if (catalysts.length === 0) return [];

  let items = catalysts.map(mapCatalyst).filter(isDisplayableCatalyst);
  items = attachRvol(items);
  items = items.map((c) => ({
    ...c,
    setupTags:
      c.setupTags?.length
        ? c.setupTags
        : detectSetupTags({
            symbol: c.symbol,
            changePercent: c.changePercent,
            rVol: c.rVol,
            catalystType: c.catalystType,
            relatedSymbols: c.relatedSymbols,
            isPremarket: c.isPremarket,
          }),
  }));
  items = rankMovers(items, moversOnly);
  items = attachStoryClusters(items);
  return items.slice(0, limit);
}

/** Fast path — prepend new wire items to Redis feed without full DB rebuild */
async function prependToPublicFeedCache(newItems: CatalystItem[]): Promise<void> {
  const enriched = await enrichItemsWithQuotes(newItems);
  const displayable = enriched.filter(isDisplayableCatalyst);
  if (displayable.length === 0) return;

  const [{ items: existingAll }, { items: existingMovers }] = await Promise.all([
    getCachedFeed("all"),
    getCachedFeed("movers"),
  ]);

  const seen = new Set<string>();
  const allMerged: CatalystItem[] = [];
  for (const c of [...displayable, ...existingAll]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    allMerged.push(c);
    if (allMerged.length >= MAX_CATALYSTS_SHOWN) break;
  }

  const moverSeen = new Set<string>();
  const moversMerged: CatalystItem[] = [];
  for (const c of [...displayable.filter(isMoverCatalyst), ...existingMovers]) {
    if (moverSeen.has(c.id)) continue;
    moverSeen.add(c.id);
    moversMerged.push(c);
    if (moversMerged.length >= MAX_CATALYSTS_SHOWN) break;
  }

  await Promise.all([
    setCachedFeed("all", allMerged),
    setCachedFeed("movers", moversMerged),
  ]);

  lastGood.set("all", { ts: Date.now(), items: allMerged });
  lastGood.set("movers", { ts: Date.now(), items: moversMerged });
}

/** Called by cron/worker after ingest — writes shared feed snapshot. */
export async function refreshPublicFeedCache(): Promise<void> {
  const limit = MAX_CATALYSTS_SHOWN;
  const [allItems, moverItems] = await Promise.all([
    buildFeedFromDatabase(limit, false),
    buildFeedFromDatabase(limit, true),
  ]);

  const symbols = [...new Set(allItems.map((c) => c.symbol))];
  const quotes = await getCachedQuotes(symbols);

  const mergedAll = mergeQuotesIntoFeed(allItems, quotes);
  const mergedMovers = mergeQuotesIntoFeed(moverItems, quotes);

  await setCachedFeed("all", mergedAll);
  await setCachedFeed("movers", mergedMovers);

  lastGood.set("all", { ts: Date.now(), items: mergedAll });
  lastGood.set("movers", { ts: Date.now(), items: mergedMovers });
}

export async function getCatalysts(
  limit = MAX_CATALYSTS_SHOWN,
  options: { moversOnly?: boolean } = {}
): Promise<CatalystItem[]> {
  const moversOnly = options.moversOnly === true;
  const cacheKey: FeedCacheKey = moversOnly ? "movers" : "all";

  const cached = lastGood.get(cacheKey);
  if (cached && Date.now() - cached.ts < FEED_CACHE_MS) {
    return cached.items.slice(0, limit);
  }

  const shared = await getCachedFeed(cacheKey);
  if (shared.items.length > 0) {
    const items = shared.items.slice(0, limit);
    lastGood.set(cacheKey, { ts: Date.now(), items });
    return items;
  }

  if (isScaleMode()) {
    const stale = lastGood.get(cacheKey);
    if (stale && Date.now() - stale.ts < LAST_GOOD_TTL_MS) {
      return stale.items.slice(0, limit);
    }
    return [];
  }

  try {
    const result = await buildFeedFromDatabase(limit, moversOnly);
    const quotes = await getCachedQuotes(result.map((c) => c.symbol));
    const merged = mergeQuotesIntoFeed(result, quotes);
    lastGood.set(cacheKey, { ts: Date.now(), items: merged });
    void setCachedFeed(cacheKey, merged).catch(() => {});
    return merged;
  } catch {
    const stale = lastGood.get(cacheKey);
    if (stale && Date.now() - stale.ts < LAST_GOOD_TTL_MS) {
      return stale.items.slice(0, limit);
    }
    return [];
  }
}

function rankMovers(items: CatalystItem[], moversOnly: boolean): CatalystItem[] {
  const filtered = moversOnly ? items.filter(isMoverCatalyst) : items;
  // One row per article — do not collapse by symbol (that hides older stories)
  return [...filtered].sort(sortByRecency);
}

function attachRvol(items: CatalystItem[]): CatalystItem[] {
  return items.map((c) => ({
    ...c,
    rVol: computeRvol(c.volume, c.avgVolume) ?? c.rVol ?? null,
  }));
}

function mapCatalyst(c: {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: Date;
  aiSummary: string | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  floatShares: number | null;
  marketCap: number | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  avgVolume: number | null;
  isPremarket: boolean;
  historicalAvgMove: number | null;
  historicalSampleSize: number | null;
  catalystType: string | null;
  urgencyScore: number | null;
  relatedSymbols?: string[];
  storyClusterId?: string | null;
  setupTags?: string[];
  verifiedConfidence?: number | null;
  keyPoints?: string[];
  sourceTier?: string | null;
  createdAt?: Date;
}): CatalystItem {
  return {
    id: c.id,
    symbol: c.symbol,
    headline: c.headline,
    source: c.source,
    sourceUrl: c.sourceUrl,
    publishedAt: c.publishedAt.toISOString(),
    aiSummary: c.aiSummary,
    sentimentScore: c.sentimentScore,
    sentimentLabel: c.sentimentLabel,
    floatShares: c.floatShares,
    marketCap: c.marketCap,
    price: c.price,
    changePercent: c.changePercent,
    volume: c.volume,
    avgVolume: c.avgVolume,
    rVol: computeRvol(c.volume, c.avgVolume),
    isPremarket: c.isPremarket,
    historicalAvgMove: c.historicalAvgMove,
    historicalSampleSize: c.historicalSampleSize,
    catalystType: c.catalystType,
    urgencyScore: c.urgencyScore,
    relatedSymbols: c.relatedSymbols?.length ? c.relatedSymbols : undefined,
    storyClusterId: c.storyClusterId ?? undefined,
    setupTags: c.setupTags?.length ? c.setupTags : undefined,
    verifiedConfidence: c.verifiedConfidence ?? undefined,
    keyPoints: c.keyPoints?.length ? c.keyPoints : undefined,
    sourceTier: c.sourceTier ?? undefined,
    ingestedAt: c.createdAt?.toISOString(),
    ingestDelaySec:
      c.createdAt != null
        ? Math.max(
            0,
            Math.round((c.createdAt.getTime() - c.publishedAt.getTime()) / 1000)
          )
        : undefined,
  };
}

function isPremarketHours(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const time = hours * 60 + minutes;
  return time >= 240 && time < 570;
}

let instantLoopStarted = false;
function startInstantIngestLoop(): void {
  if (instantLoopStarted) return;
  // Production scale mode relies on cron/worker; local dev always runs the loop.
  if (isScaleMode() && process.env.NODE_ENV === "production") return;
  instantLoopStarted = true;

  const wireTick = () =>
    void ingestWireBurst().catch(() => {});
  const fullTick = () =>
    void ingestAndAnalyzeNews({ fast: true })
      .then((batch) => {
        if (batch.newCount > 0) return prependToPublicFeedCache(batch.newItems);
      })
      .catch(() => {});

  wireTick();
  fullTick();
  setInterval(wireTick, WIRE_BURST_MS);
  setInterval(fullTick, FULL_INGEST_MS);
}

if (typeof globalThis !== "undefined" && process.env.NODE_ENV !== "production") {
  startInstantIngestLoop();
}
