import type { NewsArticle } from "../../types/index.ts";
import { fetchSecWireFilings } from "../news-sources/sec-edgar.ts";
import { fetchGlobeNewswirePRs } from "../news-sources/globenewswire.ts";
import { fetchBusinessWirePRs } from "../news-sources/businesswire.ts";
import { fetchPrNewswirePRs } from "../news-sources/prnewswire.ts";
import {
  fetchFastMarketRssNews,
  fetchSlowMarketRssNews,
  fetchYahooTickerNews,
} from "../news-sources/market-rss.ts";
import { fetchPolygonNews } from "../news-sources/polygon-news.ts";
import {
  fetchFinnhubMarketNewsForIngest,
  fetchFinnhubCompanyNewsForIngest,
} from "../market-data.ts";
import { getPriorityTickers } from "../priority-tickers.ts";
import type { AdaptiveIntervals, SourceDefinition } from "./types.ts";

/** Free issuer PR wires — primary realtime path (no paid news vendor). */
const TIER0_INTERVALS: AdaptiveIntervals = {
  premarket: 10_000,
  regular: 8_000,
  afterhours: 20_000,
  overnight: 60_000,
};

const SEC_INTERVALS: AdaptiveIntervals = {
  premarket: 15_000,
  regular: 12_000,
  afterhours: 30_000,
  overnight: 90_000,
};

/** Finnhub + editorial RSS + Yahoo tickers — wire path with Tier 0. */
const TIER1_INTERVALS: AdaptiveIntervals = {
  premarket: 12_000,
  regular: 10_000,
  afterhours: 25_000,
  overnight: 75_000,
};

const TIER2_INTERVALS: AdaptiveIntervals = {
  premarket: 35_000,
  regular: 30_000,
  afterhours: 75_000,
  overnight: 180_000,
};

const TIER3_INTERVALS: AdaptiveIntervals = {
  premarket: 75_000,
  regular: 60_000,
  afterhours: 150_000,
  overnight: 240_000,
};

const DEFAULT_CIRCUIT = { failureThreshold: 5, coolDownMs: 5 * 60_000 };

/**
 * Registry of ingest sources by priority tier.
 * Intervals are adaptive — not a fixed "2s" claim.
 */
export const INGEST_SOURCES: SourceDefinition[] = [
  {
    id: "sec_edgar",
    name: "SEC EDGAR",
    tier: 0,
    provider: "sec",
    partition: "tier0:sec",
    featureFlag: "INGEST_SOURCE_SEC_EDGAR_ENABLED",
    intervals: SEC_INTERVALS,
    rateLimit: { max: 6, windowMs: 1_000 },
    circuit: DEFAULT_CIRCUIT,
    isSec: true,
  },
  {
    id: "globe_newswire",
    name: "GlobeNewswire",
    tier: 0,
    provider: "globe",
    partition: "tier0:globe",
    featureFlag: "INGEST_SOURCE_GLOBE_NEWSWIRE_ENABLED",
    intervals: TIER0_INTERVALS,
    rateLimit: { max: 4, windowMs: 10_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "business_wire",
    name: "Business Wire",
    tier: 0,
    provider: "businesswire",
    partition: "tier0:bw",
    featureFlag: "INGEST_SOURCE_BUSINESS_WIRE_ENABLED",
    intervals: TIER0_INTERVALS,
    rateLimit: { max: 4, windowMs: 10_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "pr_newswire",
    name: "PR Newswire",
    tier: 0,
    provider: "prnewswire",
    partition: "tier0:prn",
    featureFlag: "INGEST_SOURCE_PR_NEWSWIRE_ENABLED",
    intervals: TIER0_INTERVALS,
    rateLimit: { max: 4, windowMs: 10_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "finnhub_market",
    name: "Finnhub Market",
    tier: 1,
    provider: "finnhub",
    partition: "tier1:fh_mkt",
    featureFlag: "INGEST_SOURCE_FINNHUB_MARKET_ENABLED",
    requiresEnv: "FINNHUB_API_KEY",
    intervals: TIER1_INTERVALS,
    rateLimit: { max: 50, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "rss_fast",
    name: "Fast editorial RSS",
    /** Wire-tier — MarketWatch/CNBC/Investing (no Benzinga). */
    tier: 1,
    provider: "rss_fast",
    partition: "tier1:rss_fast",
    featureFlag: "INGEST_SOURCE_RSS_FAST_ENABLED",
    intervals: TIER1_INTERVALS,
    rateLimit: { max: 20, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "polygon_news",
    name: "Polygon / Massive News",
    /** Optional paid enrichment — vendor cadence is ~hourly on Stocks plans. */
    tier: 1,
    provider: "polygon",
    partition: "tier1:polygon",
    featureFlag: "INGEST_SOURCE_POLYGON_NEWS_ENABLED",
    requiresEnv: "POLYGON_API_KEY",
    intervals: {
      premarket: 60_000,
      regular: 60_000,
      afterhours: 120_000,
      overnight: 300_000,
    },
    rateLimit: { max: 20, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },

  {
    id: "finnhub_company",
    name: "Finnhub Company",
    /** Heavier per-symbol API — keep off the fast wire wake. */
    tier: 2,
    provider: "finnhub",
    partition: "tier2:fh_co",
    featureFlag: "INGEST_SOURCE_FINNHUB_COMPANY_ENABLED",
    requiresEnv: "FINNHUB_API_KEY",
    intervals: {
      premarket: 35_000,
      regular: 30_000,
      afterhours: 75_000,
      overnight: 150_000,
    },
    rateLimit: { max: 50, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "yahoo_ticker",
    name: "Yahoo Finance tickers",
    /** Rotating per-symbol RSS — breadth without blocking Tier 1. */
    tier: 2,
    provider: "yahoo",
    partition: "tier2:yahoo",
    featureFlag: "INGEST_SOURCE_YAHOO_TICKER_ENABLED",
    intervals: TIER2_INTERVALS,
    rateLimit: { max: 12, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "rss_slow",
    name: "Slow / commentary RSS",
    tier: 3,
    provider: "rss_slow",
    partition: "tier3:rss_slow",
    featureFlag: "INGEST_SOURCE_RSS_SLOW_ENABLED",
    intervals: TIER3_INTERVALS,
    rateLimit: { max: 10, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
];

export function sourcesForTier(tier: number): SourceDefinition[] {
  return INGEST_SOURCES.filter((s) => s.tier === tier);
}

export function getSourceById(id: string): SourceDefinition | undefined {
  return INGEST_SOURCES.find((s) => s.id === id);
}

/** Lazy-free source fetchers — one source per call for tier queues. */
export async function fetchSourceArticles(
  sourceId: string
): Promise<NewsArticle[]> {
  switch (sourceId) {
    case "sec_edgar":
      return fetchSecWireFilings();
    case "globe_newswire":
      return fetchGlobeNewswirePRs();
    case "business_wire":
      return fetchBusinessWirePRs();
    case "pr_newswire":
      return fetchPrNewswirePRs();
    case "finnhub_market":
      return fetchFinnhubMarketNewsForIngest();
    case "finnhub_company":
      return fetchFinnhubCompanyNewsForIngest();
    case "rss_fast":
      return fetchFastMarketRssNews();
    case "polygon_news":
      return fetchPolygonNews(50);
    case "rss_slow":
      return fetchSlowMarketRssNews();
    case "yahoo_ticker": {
      const priority = await getPriorityTickers();
      return fetchYahooTickerNews(24, priority.slice(0, 16));
    }
    default:
      return [];
  }
}
