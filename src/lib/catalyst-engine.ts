import { prisma } from "./prisma";
import { analyzeNews } from "./ai";
import {
  fetchMarketNews,
  fetchFastWireNews,
  fetchQuote,
  fetchQuoteTrusted,
  estimateHistoricalMove,
  isPlaceholderQuote,
  isValidTickerFormat,
  isTrustedNewsSource,
} from "./market-data";
import { refreshCatalystQuotes } from "./catalyst-quotes";
import { computeRvol } from "./volume-utils";
import { verifyNewsArticle, isRoundupArticle, isLikelyStockNews, isKnownFalsePositive } from "./news-verifier";
import { isMoverCatalyst, sortByRecency } from "./movers";
import { dispatchWatchlistAlerts } from "./watchlist-alerts";
import { storyClusterKey, attachStoryClusters } from "./story-cluster";
import { detectSetupTags } from "./setup-tags";
import { getSourceTier } from "./source-trust";
import type { CatalystItem } from "@/types";
import type { NewsArticle } from "@/types";

let lastIngestTime = 0;
let lastPurgeTime = 0;
let ingestInProgress = false;
let ingestErrorStreak = 0;

// Prevent feed flicker: if a poll hits a transient DB error, return last known good data
const lastGood = new Map<"all" | "movers", { ts: number; items: CatalystItem[] }>();
const LAST_GOOD_TTL_MS = 3 * 60 * 1000;

const WIRE_BURST_MS = 5_000;
const FULL_INGEST_MS = 25_000;
const MAX_NEW_INGEST_PER_CYCLE = 50;
const MAX_WIRE_BURST_NEW = 35;
const INGEST_SCAN_WINDOW = 500;
const MAX_CATALYSTS_SHOWN = 400;
const MAX_NEWS_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_NEWS_MS = 45 * 60 * 1000;

/** Stock-impact news only — blocks lifestyle PR and false ticker matches */
function isDisplayableCatalyst(c: CatalystItem): boolean {
  if (!isValidTickerFormat(c.symbol)) return false;
  if (!isLikelyStockNews(c.headline, c.aiSummary ?? undefined)) return false;
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

export async function ingestAndAnalyzeNews(
  options: { fast?: boolean; wireOnly?: boolean } = {}
): Promise<CatalystItem[]> {
  const wireOnly = options.wireOnly === true;
  const news = wireOnly
    ? await fetchFastWireNews()
    : await fetchMarketNews({ fast: options.fast !== false });
  const results: CatalystItem[] = [];
  const quoteCache = new Map<string, Awaited<ReturnType<typeof fetchQuote>>>();
  const cutoff = Date.now() - MAX_NEWS_AGE_MS;
  const maxNew = wireOnly ? MAX_WIRE_BURST_NEW : MAX_NEW_INGEST_PER_CYCLE;
  const concurrency = wireOnly ? 10 : 5;
  const quoteTimeoutMs = wireOnly ? 600 : 2000;

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
    if (isKnownFalsePositive(symbol, article.headline, article.summary)) return null;

    const relatedSymbols = (verified.relatedSymbols ?? [])
      .filter((s) => s !== symbol)
      .slice(0, 10);

    const quote = await quoteWithTimeout(
      () => getQuote(symbol, article.id, article.source),
      quoteTimeoutMs
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
    .slice(0, INGEST_SCAN_WINDOW);

  const existingRows = await prisma.catalyst.findMany({
    where: { rawNewsId: { in: freshNews.map((a) => a.id) } },
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
  const existingByRawId = new Map(
    existingRows
      .filter((r) => r.rawNewsId)
      .map((r) => [r.rawNewsId as string, r])
  );

  if (!wireOnly) {
    for (const article of freshNews.filter((a) => existingByRawId.has(a.id))) {
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
    .filter((a) => !existingByRawId.has(a.id))
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
    void dispatchWatchlistAlerts(newItems).catch(() => {});
  }

  return rankMovers(results.filter(isDisplayableCatalyst), false);
}

/** Wire + RSS burst — runs every few seconds for near-real-time headlines */
export async function ingestWireBurst(): Promise<CatalystItem[]> {
  return ingestAndAnalyzeNews({ fast: true, wireOnly: true });
}

let wireBurstInProgress = false;
let lastWireBurstTime = 0;
const MIN_WIRE_BURST_GAP_MS = 4_000;

function triggerWireBurst(): void {
  if (wireBurstInProgress) return;
  if (Date.now() - lastWireBurstTime < MIN_WIRE_BURST_GAP_MS) return;
  wireBurstInProgress = true;
  void ingestWireBurst()
    .catch(() => {
      ingestErrorStreak += 1;
    })
    .finally(() => {
      wireBurstInProgress = false;
      lastWireBurstTime = Date.now();
    });
}

function triggerBackgroundIngest(): void {
  if (ingestInProgress) return;
  ingestInProgress = true;
  void ingestAndAnalyzeNews({ fast: true })
    .catch(() => {
      ingestErrorStreak += 1;
    })
    .finally(() => {
      ingestInProgress = false;
      lastIngestTime = Date.now();
    });
}

export async function getCatalysts(
  limit = MAX_CATALYSTS_SHOWN,
  options: { moversOnly?: boolean } = {}
): Promise<CatalystItem[]> {
  const moversOnly = options.moversOnly === true;
  const cutoff = new Date(Date.now() - MAX_NEWS_AGE_MS);
  const cacheKey: "all" | "movers" = moversOnly ? "movers" : "all";

  try {
    // Stale cleanup at most once per hour — do not delete recent rows on every poll
    if (Date.now() - lastPurgeTime > 60 * 60_000) {
      await purgeStaleCatalysts();
      lastPurgeTime = Date.now();
    }

    const catalysts = await prisma.catalyst.findMany({
      where: {
        publishedAt: { gte: cutoff },
      },
      orderBy: { publishedAt: "desc" },
      // Pull a deep window so high-volume days don't cause feed flicker
      take: Math.min(limit * 8, 2000),
    });

    // Kick wire burst on every feed poll — no throttle
    triggerWireBurst();

    if (catalysts.length === 0) {
      return [];
    }

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
    const result = items.slice(0, limit);

    // Refresh prices for top symbols in the feed (price-only — stays under Finnhub limits)
    void refreshCatalystQuotes(result, 8).catch(() => {});

    lastGood.set(cacheKey, { ts: Date.now(), items: result });
    return result;
  } catch {
    triggerWireBurst();
    const cached = lastGood.get(cacheKey);
    if (cached && Date.now() - cached.ts < LAST_GOOD_TTL_MS) {
      return cached.items;
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
  instantLoopStarted = true;

  const wireTick = () => void ingestWireBurst().catch(() => {});
  const fullTick = () => void ingestAndAnalyzeNews({ fast: true }).catch(() => {});

  wireTick();
  fullTick();
  setInterval(wireTick, WIRE_BURST_MS);
  setInterval(fullTick, FULL_INGEST_MS);
}

if (typeof globalThis !== "undefined") {
  startInstantIngestLoop();
}
