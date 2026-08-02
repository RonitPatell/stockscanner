export interface CatalystHeadline {
  id: string;
  headline: string;
  source: string;
  sourceUrl?: string | null;
  publishedAt: string;
  sentimentScore?: number | null;
  catalystType?: string | null;
  aiSummary?: string | null;
}

export interface CatalystItem {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl?: string | null;
  publishedAt: string;
  aiSummary?: string | null;
  sentimentScore?: number | null;
  sentimentLabel?: string | null;
  floatShares?: number | null;
  marketCap?: number | null;
  price?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  avgVolume?: number | null;
  rVol?: number | null;
  isPremarket?: boolean;
  historicalAvgMove?: number | null;
  historicalSampleSize?: number | null;
  catalystType?: string | null;
  urgencyScore?: number | null;
  /** Other verified tickers mentioned in the same article (session roundups) */
  relatedSymbols?: string[];
  /** Cluster id for same-story grouping across sources */
  storyClusterId?: string | null;
  setupTags?: string[];
  verifiedConfidence?: number | null;
  /** cashtag | exchange_tag | company_name | … */
  matchMethod?: string | null;
  /** USER_WATCHLIST | CURATED_CORE | ACTIVE_GAINER | … */
  coverageReason?: string | null;
  quarantined?: boolean;
  /** Judgment V2 snapshot when flag enabled / persisted */
  judgmentV2?: import("@/lib/judgment/types").JudgmentV2;
  keyPoints?: string[];
  sourceTier?: string | null;
  /** All headlines when multiple news items exist for this symbol */
  headlines?: CatalystHeadline[];
  newsCount?: number;
  /** When TrustTicker first ingested this headline (ISO) */
  ingestedAt?: string;
  /** Seconds from publish → ingest */
  ingestDelaySec?: number;
}

export interface ScannerFilters {
  minSentiment?: number;
  maxSentiment?: number;
  catalystTypes?: string[];
  premarketOnly?: boolean;
  minUrgency?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minFloatM?: number;
  maxFloatM?: number;
  minChange?: number;
  maxChange?: number;
  minRvol?: number;
}

export interface BriefItem {
  symbol: string;
  headline: string;
  changePercent?: number | null;
  catalystType?: string | null;
  publishedAt: string;
  setupTags?: string[];
}

export interface BriefSection {
  title: string;
  items: BriefItem[];
}

export interface WatchlistBrief {
  kind: "morning" | "eod" | "delta";
  generatedAt: string;
  watchlist: string[];
  sections: BriefSection[];
  summary: string;
  newSinceLastCheck: number;
}

export interface EarningsEvent {
  symbol: string;
  date: string; // YYYY-MM-DD
  hour?: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume?: number;
  rVol?: number;
  dayHigh?: number;
  dayLow?: number;
  open?: number;
  prevClose?: number;
  marketCap?: number;
  floatShares?: number;
}

export type MarketAlertType =
  | "hod"
  | "near_hod"
  | "hod_retest"
  | "volume_surge"
  | "milestone_15m"
  | "momentum";

export interface MarketAlert {
  id: string;
  symbol: string;
  type: MarketAlertType;
  message: string;
  changePercent: number;
  price: number;
  rVol?: number;
  timestamp: string;
}

export interface VolumeLeader {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  rVol: number;
  dayHigh: number;
  nearHod: boolean;
  marketCap?: number;
  /** Share float when the quote/profile feed has it. */
  floatShares?: number;
  /** Trade prints when the upstream feed provides a count; otherwise omit. */
  ticks?: number;
  /** Client sticky / universe source — not shown in UI. */
  source?: "scanner" | "universe" | "news" | "lookup";
}

export interface MarketScannerSnapshot {
  alerts: MarketAlert[];
  volumeLeaders: VolumeLeader[];
  scannedAt: string;
  marketSession: "premarket" | "regular" | "afterhours" | "closed";
}

/** Optional end-to-end latency tracing metadata attached during ingest. */
export interface NewsArticleTraceMeta {
  providerPublishedAt?: Date | null;
  firstFetchedAt?: Date;
  fetchCompletedAt?: Date;
  parsedAt?: Date;
  timestampQuality?:
    | "EXACT_PROVIDER"
    | "ESTIMATED_PROVIDER"
    | "ARTICLE_UPDATED_TIME"
    | "MISSING"
    | "INVALID";
  providerItemId?: string;
}

export interface NewsArticle {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: Date;
  summary?: string;
  /** Populated by news fetchers / annotateFetchedArticles for latency tracing. */
  trace?: NewsArticleTraceMeta;
}

export const CATALYST_TYPES = [
  { id: "earnings", label: "Earnings", icon: "📊" },
  { id: "fda", label: "FDA / Biotech", icon: "💊" },
  { id: "merger", label: "M&A", icon: "🤝" },
  { id: "upgrade", label: "Upgrade", icon: "⬆️" },
  { id: "downgrade", label: "Downgrade", icon: "⬇️" },
  { id: "insider", label: "Insider", icon: "👤" },
  { id: "sec_filing", label: "SEC Filing", icon: "📄" },
  { id: "macro", label: "Macro", icon: "🌐" },
  { id: "contract", label: "Contract Win", icon: "📝" },
  { id: "offering", label: "Offering", icon: "💰" },
] as const;
