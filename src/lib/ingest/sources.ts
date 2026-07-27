import type { NewsArticle } from "../../types/index.ts";
import { fetchSecWireFilings } from "../news-sources/sec-edgar.ts";
import { fetchGlobeNewswirePRs } from "../news-sources/globenewswire.ts";
import { fetchBusinessWirePRs } from "../news-sources/businesswire.ts";
import { fetchPrNewswirePRs } from "../news-sources/prnewswire.ts";
import { fetchBenzingaApiNews } from "../news-sources/benzinga-api.ts";
import {
  fetchFastMarketRssNews,
  fetchSlowMarketRssNews,
  fetchYahooTickerNews,
} from "../news-sources/market-rss.ts";
import {
  fetchFinnhubMarketNewsForIngest,
  fetchFinnhubCompanyNewsForIngest,
} from "../market-data.ts";
import { getPriorityTickers } from "../priority-tickers.ts";
import type { AdaptiveIntervals, SourceDefinition } from "./types.ts";

const TIER0_INTERVALS: AdaptiveIntervals = {
  premarket: 12_000,
  regular: 10_000,
  afterhours: 30_000,
  overnight: 90_000,
};

const SEC_INTERVALS: AdaptiveIntervals = {
  premarket: 20_000,
  regular: 15_000,
  afterhours: 45_000,
  overnight: 120_000,
};

const TIER1_INTERVALS: AdaptiveIntervals = {
  premarket: 20_000,
  regular: 15_000,
  afterhours: 45_000,
  overnight: 120_000,
};

const TIER2_INTERVALS: AdaptiveIntervals = {
  premarket: 45_000,
  regular: 40_000,
  afterhours: 90_000,
  overnight: 240_000,
};

const TIER3_INTERVALS: AdaptiveIntervals = {
  premarket: 90_000,
  regular: 75_000,
  afterhours: 180_000,
  overnight: 300_000,
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
    id: "benzinga_api",
    name: "Benzinga API",
    tier: 1,
    provider: "benzinga_api",
    partition: "tier1:bzapi",
    featureFlag: "INGEST_SOURCE_BENZINGA_API_ENABLED",
    requiresEnv: "BENZINGA_API_KEY",
    intervals: TIER1_INTERVALS,
    rateLimit: { max: 30, windowMs: 60_000 },
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
    id: "finnhub_company",
    name: "Finnhub Company",
    tier: 1,
    provider: "finnhub",
    partition: "tier1:fh_co",
    featureFlag: "INGEST_SOURCE_FINNHUB_COMPANY_ENABLED",
    requiresEnv: "FINNHUB_API_KEY",
    intervals: {
      premarket: 45_000,
      regular: 40_000,
      afterhours: 90_000,
      overnight: 180_000,
    },
    rateLimit: { max: 50, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "rss_fast",
    name: "Fast editorial RSS",
    tier: 2,
    provider: "rss_fast",
    partition: "tier2:rss_fast",
    featureFlag: "INGEST_SOURCE_RSS_FAST_ENABLED",
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
    rateLimit: { max: 8, windowMs: 60_000 },
    circuit: DEFAULT_CIRCUIT,
  },
  {
    id: "yahoo_ticker",
    name: "Yahoo Finance tickers",
    tier: 3,
    provider: "yahoo",
    partition: "tier3:yahoo",
    featureFlag: "INGEST_SOURCE_YAHOO_TICKER_ENABLED",
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
    case "benzinga_api":
      return fetchBenzingaApiNews(50);
    case "finnhub_market":
      return fetchFinnhubMarketNewsForIngest();
    case "finnhub_company":
      return fetchFinnhubCompanyNewsForIngest();
    case "rss_fast":
      return fetchFastMarketRssNews();
    case "rss_slow":
      return fetchSlowMarketRssNews();
    case "yahoo_ticker": {
      const priority = await getPriorityTickers();
      return fetchYahooTickerNews(40, priority);
    }
    default:
      return [];
  }
}
