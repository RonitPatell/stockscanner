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
import {
  storyClusterKey,
  collapseStoryClusters,
  storyDedupeKey,
} from "./story-cluster";
import { detectSetupTags } from "./setup-tags";
import { getSourceTier } from "./source-trust";
import { isScaleMode } from "./redis";
import { getCachedFeed, setCachedFeed, type FeedCacheKey } from "./feed-cache";
import {
  getCachedQuotes,
  mergeQuotesIntoFeed,
  refreshQuoteCache,
  refreshQuoteVolumes,
} from "./quote-cache-service";
import {
  recordLatencyTrace,
  markTracesSsePublished,
} from "./latency-trace";
import { getCachedProfiles, refreshProfileCache } from "./profile-cache-service";
import { markArticlesSeen } from "./ingest/idempotency-store";
import type { CatalystItem } from "@/types";
import type { NewsArticle } from "@/types";
import { getPriorityTickers } from "./priority-tickers";

let lastPurgeTime = 0;

// Prevent feed flicker: if a poll hits a transient DB error, return last known good data
const lastGood = new Map<"all" | "movers", { ts: number; items: CatalystItem[] }>();
const LAST_GOOD_TTL_MS = 3 * 60 * 1000;

const WIRE_BURST_MS = 3_000;
const FULL_INGEST_MS = 45_000;
const MAX_NEW_INGEST_PER_CYCLE = 40;
const MAX_WIRE_BURST_NEW = 80;
const INGEST_SCAN_WINDOW = 180;
const MAX_CATALYSTS_SHOWN = 300;
/** Feed shows session news only — not a day-old archive. */
const FEED_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** Keep DB rows longer for review / autopsy; feed eligibility uses FEED_MAX_AGE_MS. */
const PURGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RECENT_NEWS_MS = 90 * 60 * 1000;
/** Free RSS/PR publishers lag; accept up to 3h so wire path doesn't drop fresh stories. */
const WIRE_RECENT_MS = 3 * 60 * 60 * 1000;
const FEED_CACHE_MS = isScaleMode() ? 1_500 : 2_500;

/** Structural / relevance gates (no price requirement). */
function isFeedEligibleCatalyst(c: CatalystItem): boolean {
  if (!isValidTickerFormat(c.symbol)) return false;
  if (!isLikelyStockNews(c.headline, c.aiSummary ?? undefined)) return false;
  if (!articleIsAboutSymbol(c.symbol, c.headline, c.aiSummary ?? undefined)) return false;
  if (isKnownFalsePositive(c.symbol, c.headline, c.aiSummary ?? undefined)) return false;
  if (Date.now() - new Date(c.publishedAt).getTime() > FEED_MAX_AGE_MS) return false;
  return true;
}

/** Stock-impact news only — blocks lifestyle PR and false ticker matches */
function isDisplayableCatalyst(c: CatalystItem): boolean {
  if (!isFeedEligibleCatalyst(c)) return false;
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
    const profile = (await getCachedProfiles([symbol]))[symbol];
    return {
      symbol,
      price: hit.price,
      changePercent: hit.changePercent,
      change: hit.change,
      volume: 0,
      floatShares: hit.floatShares ?? profile?.floatShares,
      marketCap: hit.marketCap ?? profile?.marketCap,
    };
  }

  if (wireOnly) {
    void (async () => {
      const live =
        (await quoteWithTimeout(() => fetchQuoteLive(symbol), 4_000)) ??
        (await getQuote(symbol, articleId, source));
      if (!live?.price) return;
      const { seedCachedQuote } = await import("./quote-cache-service");
      await seedCachedQuote(symbol, {
        price: live.price,
        changePercent: live.changePercent,
        change: live.change,
        volume: live.volume,
        avgVolume: live.avgVolume,
      });
    })();
    return null;
  }

  const live =
    (await quoteWithTimeout(() => fetchQuoteLive(symbol), 2_000)) ??
    (await getQuote(symbol, articleId, source));
  return live;
}

function positiveNum(n: number | null | undefined): number | undefined {
  return n != null && Number.isFinite(n) && n > 0 ? n : undefined;
}

type QuoteMap = Record<
  string,
  Awaited<ReturnType<typeof getCachedQuotes>>[string]
>;

/** Apply already-cached profiles onto a quote map (no network). */
async function mergeCachedProfilesIntoQuotes(
  symbols: string[],
  quotesIn: QuoteMap
): Promise<QuoteMap> {
  const quotes = { ...quotesIn };
  const profiles = await getCachedProfiles(symbols);
  for (const sym of symbols) {
    const p = profiles[sym];
    if (!p) continue;
    const float =
      positiveNum(quotes[sym]?.floatShares) ?? positiveNum(p.floatShares);
    const mcap =
      positiveNum(quotes[sym]?.marketCap) ?? positiveNum(p.marketCap);
    if (!float && !mcap) continue;
    if (quotes[sym]) {
      quotes[sym] = {
        ...quotes[sym],
        floatShares: float ?? quotes[sym].floatShares,
        marketCap: mcap ?? quotes[sym].marketCap,
      };
    } else {
      quotes[sym] = {
        price: 0,
        changePercent: 0,
        change: 0,
        floatShares: float,
        marketCap: mcap,
      };
    }
  }
  return quotes;
}

/**
 * Merge float/mcap from profiles. Cached profiles are always applied;
 * network refresh is optional and capped so feed rebuilds stay fast.
 */
async function attachProfilesToQuotes(
  symbols: string[],
  quotesIn: QuoteMap,
  opts: { fetchMissing?: boolean; fetchLimit?: number } = {}
): Promise<QuoteMap> {
  const fetchMissing = opts.fetchMissing !== false;
  const fetchLimit = opts.fetchLimit ?? 24;
  let quotes = await mergeCachedProfilesIntoQuotes(symbols, quotesIn);
  if (!fetchMissing) return quotes;

  const needProfiles = symbols.filter(
    (s) =>
      !positiveNum(quotes[s]?.floatShares) || !positiveNum(quotes[s]?.marketCap)
  );
  if (needProfiles.length === 0) return quotes;

  await refreshProfileCache(needProfiles.slice(0, fetchLimit));
  return mergeCachedProfilesIntoQuotes(symbols, quotes);
}

/** After feed write — refresh missing profiles and patch float/mcap in place. */
function scheduleFeedProfileBackfill(symbols: string[]): void {
  if (symbols.length === 0) return;
  void (async () => {
    const need = symbols.slice(0, 40);
    await refreshProfileCache(need);
    const [{ items: all }, { items: movers }] = await Promise.all([
      getCachedFeed("all"),
      getCachedFeed("movers"),
    ]);
    if (all.length === 0 && movers.length === 0) return;
    let quotes = await getCachedQuotes(need);
    quotes = await mergeCachedProfilesIntoQuotes(need, quotes);
    await writeMergedFeeds(
      mergeQuotesIntoFeed(all, quotes),
      mergeQuotesIntoFeed(movers, quotes)
    );
  })().catch(() => {});
}

async function enrichItemsWithQuotes(items: CatalystItem[]): Promise<CatalystItem[]> {
  if (items.length === 0) return items;
  const symbols = [...new Set(items.map((c) => c.symbol))];
  let quotes = await getCachedQuotes(symbols);
  const missing = symbols.filter((s) => !quotes[s]?.price);
  const needsRvol = symbols.filter((s) => quotes[s]?.price && quotes[s]?.rVol == null);
  const toRefresh = [...new Set([...missing, ...needsRvol])];
  if (toRefresh.length > 0) {
    await refreshQuoteCache(toRefresh.slice(0, 20), { fetchVolume: true });
    quotes = { ...(await getCachedQuotes(symbols)) };
    const stillNeedRvol = symbols.filter((s) => quotes[s]?.price && quotes[s]?.rVol == null);
    if (stillNeedRvol.length > 0) {
      await refreshQuoteVolumes(stillNeedRvol.slice(0, 16));
      quotes = { ...(await getCachedQuotes(symbols)) };
    }
  }

  quotes = await attachProfilesToQuotes(symbols, quotes, {
    fetchMissing: true,
    fetchLimit: 20,
  });

  return items.map((c) => {
    const q = quotes[c.symbol];
    if (!q) return c;
    const hasPrice = q.price != null && q.price > 0;
    const float = positiveNum(q.floatShares) ?? positiveNum(c.floatShares) ?? null;
    const mcap = positiveNum(q.marketCap) ?? positiveNum(c.marketCap) ?? null;
    const enriched = {
      ...c,
      price: hasPrice ? q.price : c.price,
      changePercent: hasPrice ? q.changePercent : c.changePercent,
      rVol: q.rVol ?? c.rVol,
      volume: q.volume ?? c.volume,
      avgVolume: q.avgVolume ?? c.avgVolume,
      floatShares: float,
      marketCap: mcap,
    };
    void prisma.catalyst
      .update({
        where: { id: c.id },
        data: {
          ...(hasPrice
            ? { price: q.price, changePercent: q.changePercent }
            : {}),
          ...(q.volume != null ? { volume: q.volume } : {}),
          ...(q.avgVolume != null ? { avgVolume: q.avgVolume } : {}),
          ...(float != null ? { floatShares: float } : {}),
          ...(mcap != null ? { marketCap: mcap } : {}),
        },
      })
      .catch(() => {});
    return enriched;
  });
}

/** Only remove items older than 24h — never re-purge recent headlines */
async function purgeStaleCatalysts(): Promise<void> {
  try {
    await prisma.catalyst.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - PURGE_MAX_AGE_MS) } },
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
  const cutoff = Date.now() - FEED_MAX_AGE_MS;
  const wireRecentCutoff = Date.now() - WIRE_RECENT_MS;
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

    const { assessMatchConfidence, quarantineMatch } = await import("./coverage/match-confidence");
    const { matchMethodForSymbol } = await import("./news-verifier");
    const method =
      verified.method ||
      (verified.symbol
        ? matchMethodForSymbol(verified.symbol, article.headline, article.summary)
        : "unknown");
    const assessment = assessMatchConfidence({
      confidence: verified.confidence,
      method,
      reason: verified.reason,
      headline: article.headline,
      summary: article.summary,
      valid: verified.valid,
    });

    if (assessment.disposition === "reject") return null;

    if (assessment.disposition === "quarantine") {
      await quarantineMatch({
        rawNewsId: article.id,
        symbol: verified.symbol || null,
        headline: article.headline,
        source: article.source,
        confidence: assessment.confidence,
        matchMethod: assessment.method,
        reason: assessment.reason,
        publishedAt: article.publishedAt,
      }).catch(() => {});
      return null;
    }

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
      article.summary,
      {
        changePercent: quote?.changePercent ?? null,
        floatShares: quote?.floatShares ?? null,
      }
    );

    const classifiedAt = new Date();
    // Alert Backbone V2: do not block breaking publish on historical enrichment.
    let historical: { avgMove: number | null; sampleSize: number | null } = {
      avgMove: null,
      sampleSize: null,
    };
    const { isPreliminaryPublishEnabled } = await import("./alert-backbone/flags");
    if (!isPreliminaryPublishEnabled() || !wireOnly) {
      historical = estimateHistoricalMove(analysis.catalystType);
      if (historical.avgMove != null) {
        analysis.keyPoints = [
          ...analysis.keyPoints,
          `Historical avg move for similar news: ${historical.avgMove.toFixed(1)}% (n=${historical.sampleSize})`,
        ];
        analysis.summary += ` · hist avg move ~${historical.avgMove.toFixed(1)}%`;
      }
    }
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
      matchMethod: method,
      coverageReason: null as string | null,
      quarantined: false,
      keyPoints: analysis.keyPoints,
      sourceTier,
    };

    // Temporary coverage for fresh news / SEC outside curated core
    void (async () => {
      try {
        const { promoteTemporaryCoverage, primaryCoverageReason } = await import(
          "./coverage/coverage-service"
        );
        const isSec = article.source === "SEC EDGAR" || article.id.startsWith("sec-");
        const haltNews = /\b(trading\s+halt|halted|luld)\b/i.test(article.headline);
        if (isSec) {
          await promoteTemporaryCoverage({
            symbol,
            reason: "FRESH_SEC_FILING",
            note: "edgar",
          });
        } else if (haltNews) {
          await promoteTemporaryCoverage({
            symbol,
            reason: "RECENT_HALT",
            note: "headline_halt — no exchange halt feed",
          });
        } else {
          await promoteTemporaryCoverage({
            symbol,
            reason: "FRESH_NEWS",
            note: method,
          });
        }
        const reason = await primaryCoverageReason(symbol);
        if (reason) {
          await prisma.catalyst
            .updateMany({
              where: { rawNewsId: article.id },
              data: { coverageReason: reason },
            })
            .catch(() => {});
        }
      } catch {
        /* non-fatal */
      }
    })();

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
              ...(quote.floatShares != null ? { floatShares: quote.floatShares } : {}),
              ...(quote.marketCap != null ? { marketCap: quote.marketCap } : {}),
              setupTags,
            }
          : {}),
        keyPoints: analysis.keyPoints,
        verifiedConfidence: verified.confidence,
      },
    });

    void recordLatencyTrace({
      catalystId: catalyst.id,
      source: article.source,
      sourceTier,
      providerItemId: article.trace?.providerItemId ?? article.id,
      url: article.url,
      symbol,
      catalystType,
      headline: article.headline,
      summary: article.summary ?? analysis.summary,
      relatedSymbols,
      timestampQuality: article.trace?.timestampQuality ?? "ESTIMATED_PROVIDER",
      providerPublishedAt:
        article.trace?.providerPublishedAt ?? article.publishedAt,
      firstFetchedAt: article.trace?.firstFetchedAt,
      fetchCompletedAt: article.trace?.fetchCompletedAt,
      parsedAt: article.trace?.parsedAt,
      classifiedAt,
      persistedAt: catalyst.createdAt,
      trace: article.trace,
    });

    const mapped = mapCatalyst(catalyst);
    void (async () => {
      try {
        const { registerPreliminaryAlertEvent } = await import(
          "./alert-backbone/preliminary"
        );
        await registerPreliminaryAlertEvent({
          item: mapped,
          rawNewsId: article.id,
          timestampQuality: article.trace?.timestampQuality ?? null,
        });
      } catch {
        /* non-fatal */
      }
    })();

    void (async () => {
      try {
        const { computeReactionStageEngine, persistReactionStageResult, floatBand, priceBand, liquidityBand } =
          await import("./reaction-stage");
        const result = computeReactionStageEngine({
          catalystId: catalyst.id,
          symbol,
          headline: article.headline,
          summary: article.summary ?? analysis.summary,
          source: article.source,
          category: catalystType,
          floatShares: quote?.floatShares ?? null,
          providerPublishedAt: article.publishedAt.toISOString(),
          firstSeenAt: catalyst.createdAt.toISOString(),
          classifiedAt: classifiedAt.toISOString(),
          ingestedAt: catalyst.createdAt.toISOString(),
          timestampQuality:
            (article.trace?.timestampQuality as
              | "EXACT_PROVIDER"
              | "ESTIMATED_PROVIDER"
              | "ARTICLE_UPDATED_TIME"
              | "MISSING"
              | "INVALID"
              | null) ?? "ESTIMATED_PROVIDER",
          priceAtIngestion: quote?.price ?? null,
          priceAtIngestionQuality: quote?.price != null ? "ok" : "unavailable",
          tape: {
            currentPrice: quote?.price ?? null,
            dayChangePercent: quote?.changePercent ?? null,
            rVol: null,
            quoteAgeSec: 0,
          },
        });
        await persistReactionStageResult(result, {
          catalystId: catalyst.id,
          symbol,
          category: catalystType,
          floatBucket: floatBand(quote?.floatShares ?? null),
          priceBucket: priceBand(quote?.price ?? null),
          liquidityClass: liquidityBand({
            dollarVolume:
              quote?.price != null && quote?.volume != null
                ? quote.price * quote.volume
                : null,
          }),
        });
      } catch {
        /* non-fatal — table may not be pushed yet */
      }
    })();

    void (async () => {
      try {
        const { persistJudgmentV2 } = await import("./judgment/persist");
        const { isJudgmentV2Enabled } = await import("./judgment/types");
        if (!isJudgmentV2Enabled()) return;
        await persistJudgmentV2(
          catalyst.id,
          {
            symbol,
            headline: article.headline,
            source: article.source,
            sourceUrl: article.url,
            sourceTier,
            catalystType,
            sentimentScore: analysis.sentimentScore,
            changePercent: quote?.changePercent ?? null,
            rVol: null,
            floatShares: quote?.floatShares ?? null,
            urgencyScore: analysis.urgencyScore,
            historicalAvgMove: historical.avgMove,
            historicalSampleSize: historical.sampleSize,
            setupTags,
            aiSummary: analysis.summary,
            keyPoints: analysis.keyPoints,
            verifiedConfidence: verified.confidence,
            matchMethod: method,
            publishedAt: article.publishedAt.toISOString(),
            price: quote?.price ?? null,
          },
          (catalyst as { judgmentJson?: unknown }).judgmentJson
        );
      } catch {
        /* non-fatal */
      }
    })();

    // Dilution Radar V2 — SEC evidence extraction (non-blocking / enrichment path)
    void (async () => {
      try {
        const { processCatalystForDilution } = await import("./dilution/from-catalyst");
        await processCatalystForDilution({
          catalystId: catalyst.id,
          symbol,
          headline: article.headline,
          summary: article.summary ?? analysis.summary,
          source: article.source,
          sourceUrl: article.url,
          rawNewsId: article.id,
          publishedAt: article.publishedAt,
          floatShares: quote?.floatShares ?? null,
        });
      } catch {
        /* non-fatal */
      }
    })();

    // Outcome calibration — freeze ingest price snapshot (non-blocking)
    void (async () => {
      try {
        const { captureIngestSnapshot } = await import("./calibration/capture");
        let strength: string | null = null;
        let timing: string | null = null;
        try {
          const j = (catalyst as { judgmentJson?: { catalystStrength?: string; timing?: string } })
            .judgmentJson;
          strength = j?.catalystStrength ?? null;
          timing = j?.timing ?? null;
        } catch {
          /* ignore */
        }
        await captureIngestSnapshot({
          catalystId: catalyst.id,
          symbol,
          headline: article.headline,
          summary: article.summary ?? analysis.summary,
          publishedAt: article.publishedAt,
          ingestedAt: catalyst.createdAt,
          catalystType,
          sourceTier,
          strength,
          timing,
          verifiedConfidence: verified.confidence,
          floatShares: quote?.floatShares ?? null,
          price: quote?.price ?? null,
          volume: quote?.volume ?? null,
          avgVolume: quote?.avgVolume ?? null,
          changePercent: quote?.changePercent ?? null,
          quoteObservedAtMs: Date.now(),
        });
      } catch {
        /* non-fatal */
      }
    })();

    if (!quote) backfillQuote(symbol, article.id);
    return mapped;
  };

  const newItems: CatalystItem[] = [];
  const freshNews = news
    .filter((a) => a.publishedAt.getTime() >= cutoff)
    .filter((a) => !wireOnly || a.publishedAt.getTime() >= wireRecentCutoff)
    .slice(0, wireOnly ? 140 : INGEST_SCAN_WINDOW);

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
        matchMethod: true,
        coverageReason: true,
        quarantined: true,
        judgmentJson: true,
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

  const handledForIdemp: NewsArticle[] = freshNews.filter((a) =>
    existingIdSet.has(a.id)
  );

  for (let i = 0; i < unseen.length; i += concurrency) {
    const batch = unseen.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((article) =>
        ingestOne(article).catch(() => null)
      )
    );
    for (let j = 0; j < batchResults.length; j++) {
      const item = batchResults[j];
      if (!item) continue; // verify/quarantine — leave unclaimed so next poll can retry
      results.push(item);
      newItems.push(item);
      handledForIdemp.push(batch[j]);
    }
  }

  // Claim only after DB success / already-known — failed verifies stay retryable
  if (handledForIdemp.length > 0) {
    void markArticlesSeen(handledForIdemp).catch(() => {});
  }

  if (newItems.length > 0) {
    if (wireOnly) {
      void enrichItemsWithQuotes(newItems)
        .then((enriched) => {
          void patchFeedWithEnrichedItems(enriched).catch(() => {});
          void dispatchWatchlistAlerts(enriched).catch(() => {});
        })
        .catch(() => {});
    } else {
      const enriched = await enrichItemsWithQuotes(newItems);
      newItems.length = 0;
      newItems.push(...enriched);
      void dispatchWatchlistAlerts(newItems).catch(() => {});
    }
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
  const cutoff = new Date(Date.now() - FEED_MAX_AGE_MS);

  if (Date.now() - lastPurgeTime > 60 * 60_000) {
    await purgeStaleCatalysts();
    lastPurgeTime = Date.now();
  }

  const catalysts = await prisma.catalyst.findMany({
    where: { publishedAt: { gte: cutoff }, quarantined: false },
    orderBy: { publishedAt: "desc" },
    take: Math.min(limit * 2, 400),
  });

  if (catalysts.length === 0) return [];

  // Keep price-less rows here — refreshPublicFeedCache merges quotes, then display-filters.
  let items = catalysts.map(mapCatalyst).filter(isFeedEligibleCatalyst);
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
  items = collapseStoryClusters(items);
  return items.slice(0, limit);
}

function mergePrependFeeds(
  displayable: CatalystItem[],
  existingAll: CatalystItem[],
  existingMovers: CatalystItem[]
): { allMerged: CatalystItem[]; moversMerged: CatalystItem[] } {
  const mergeByStory = (incoming: CatalystItem[], existing: CatalystItem[]) => {
    const seen = new Set<string>();
    const out: CatalystItem[] = [];
    for (const c of collapseStoryClusters([...incoming, ...existing])) {
      const key = storyDedupeKey(c);
      if (seen.has(key) || seen.has(c.id)) continue;
      seen.add(key);
      seen.add(c.id);
      out.push(c);
      if (out.length >= MAX_CATALYSTS_SHOWN) break;
    }
    return out;
  };

  return {
    allMerged: mergeByStory(displayable, existingAll),
    moversMerged: mergeByStory(
      displayable.filter(isMoverCatalyst),
      existingMovers
    ),
  };
}

async function writeMergedFeeds(
  allMerged: CatalystItem[],
  moversMerged: CatalystItem[]
): Promise<void> {
  await Promise.all([
    setCachedFeed("all", allMerged),
    setCachedFeed("movers", moversMerged),
  ]);
  lastGood.set("all", { ts: Date.now(), items: allMerged });
  lastGood.set("movers", { ts: Date.now(), items: moversMerged });
  const ids = [...new Set([...allMerged, ...moversMerged].map((c) => c.id))];
  void markTracesSsePublished(ids).catch(() => {});
}

/** Patch feed rows after async quote enrichment (wire fast path). */
async function patchFeedWithEnrichedItems(enriched: CatalystItem[]): Promise<void> {
  const displayable = enriched.filter(isDisplayableCatalyst);
  if (displayable.length === 0) return;

  const byId = new Map(displayable.map((c) => [c.id, c]));
  const [{ items: existingAll }, { items: existingMovers }] = await Promise.all([
    getCachedFeed("all"),
    getCachedFeed("movers"),
  ]);

  const patchList = (items: CatalystItem[]) =>
    items.map((c) => byId.get(c.id) ?? c);

  const allMerged = patchList(existingAll);
  const moversMerged = patchList(existingMovers);
  await writeMergedFeeds(allMerged, moversMerged);
}

/** Fast path — prepend new wire items to Redis feed without full DB rebuild */
async function prependToPublicFeedCache(newItems: CatalystItem[]): Promise<void> {
  const displayable = newItems.filter(isDisplayableCatalyst);
  if (displayable.length === 0) return;

  const symbols = [...new Set(displayable.map((c) => c.symbol))];
  let quotes = await getCachedQuotes(symbols);
  quotes = await attachProfilesToQuotes(symbols, quotes, {
    fetchMissing: true,
    fetchLimit: 16,
  });
  const withQuotes = mergeQuotesIntoFeed(displayable, quotes);

  const [{ items: existingAll }, { items: existingMovers }] = await Promise.all([
    getCachedFeed("all"),
    getCachedFeed("movers"),
  ]);

  const { allMerged, moversMerged } = mergePrependFeeds(
    withQuotes,
    existingAll,
    existingMovers
  );
  await writeMergedFeeds(allMerged, moversMerged);
}

/** Called by cron/worker after ingest — writes shared feed snapshot. */
export async function refreshPublicFeedCache(): Promise<void> {
  const limit = MAX_CATALYSTS_SHOWN;
  const [allItems, moverItems] = await Promise.all([
    buildFeedFromDatabase(limit, false),
    buildFeedFromDatabase(limit, true),
  ]);

  const symbols = [...new Set(allItems.map((c) => c.symbol))];
  let quotes = await getCachedQuotes(symbols);
  const needsRefresh = symbols.filter(
    (s) => !quotes[s]?.price || quotes[s]?.rVol == null
  );
  if (needsRefresh.length > 0) {
    await refreshQuoteCache(needsRefresh.slice(0, 24), { fetchVolume: true });
    quotes = await getCachedQuotes(symbols);
    const stillNeedRvol = symbols.filter((s) => quotes[s]?.price && quotes[s]?.rVol == null);
    if (stillNeedRvol.length > 0) {
      await refreshQuoteVolumes(stillNeedRvol.slice(0, 16));
      quotes = await getCachedQuotes(symbols);
    }
  }
  // Cached profiles only — network fetch runs async so health stays Live
  quotes = await attachProfilesToQuotes(symbols, quotes, { fetchMissing: false });

  const mergedAll = mergeQuotesIntoFeed(allItems, quotes).filter(isDisplayableCatalyst);
  const mergedMovers = mergeQuotesIntoFeed(moverItems, quotes).filter(isDisplayableCatalyst);

  await setCachedFeed("all", mergedAll);
  await setCachedFeed("movers", mergedMovers);

  lastGood.set("all", { ts: Date.now(), items: mergedAll });
  lastGood.set("movers", { ts: Date.now(), items: mergedMovers });
  void markTracesSsePublished(
    [...new Set([...mergedAll, ...mergedMovers].map((c) => c.id))]
  ).catch(() => {});
  scheduleFeedProfileBackfill(symbols);
}

export async function getCatalysts(
  limit = MAX_CATALYSTS_SHOWN,
  options: { moversOnly?: boolean } = {}
): Promise<CatalystItem[]> {
  const moversOnly = options.moversOnly === true;
  const cacheKey: FeedCacheKey = moversOnly ? "movers" : "all";

  const cached = lastGood.get(cacheKey);
  if (cached && Date.now() - cached.ts < FEED_CACHE_MS) {
    return collapseStoryClusters(cached.items).slice(0, limit);
  }

  const shared = await getCachedFeed(cacheKey);
  if (shared.items.length > 0) {
    const items = collapseStoryClusters(shared.items).slice(0, limit);
    lastGood.set(cacheKey, { ts: Date.now(), items });
    return items;
  }

  if (isScaleMode()) {
    const stale = lastGood.get(cacheKey);
    if (stale && Date.now() - stale.ts < LAST_GOOD_TTL_MS) {
      return collapseStoryClusters(stale.items).slice(0, limit);
    }
    return [];
  }

  try {
    const result = await buildFeedFromDatabase(limit, moversOnly);
    const quotes = await getCachedQuotes(result.map((c) => c.symbol));
    const merged = collapseStoryClusters(mergeQuotesIntoFeed(result, quotes));
    lastGood.set(cacheKey, { ts: Date.now(), items: merged });
    void setCachedFeed(cacheKey, merged).catch(() => {});
    return merged;
  } catch {
    const stale = lastGood.get(cacheKey);
    if (stale && Date.now() - stale.ts < LAST_GOOD_TTL_MS) {
      return collapseStoryClusters(stale.items).slice(0, limit);
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
  matchMethod?: string | null;
  coverageReason?: string | null;
  quarantined?: boolean;
  judgmentJson?: unknown;
  keyPoints?: string[];
  sourceTier?: string | null;
  createdAt?: Date;
}): CatalystItem {
  const base = {
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
    matchMethod: c.matchMethod ?? undefined,
    coverageReason: c.coverageReason ?? undefined,
    quarantined: c.quarantined ?? false,
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
  if (c.judgmentJson && typeof c.judgmentJson === "object") {
    return {
      ...base,
      judgmentV2: c.judgmentJson as import("@/lib/judgment/types").JudgmentV2,
    };
  }
  return base;
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
