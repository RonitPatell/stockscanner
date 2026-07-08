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
  /** All headlines when multiple news items exist for this symbol */
  headlines?: CatalystHeadline[];
  newsCount?: number;
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
}

export interface MarketScannerSnapshot {
  alerts: MarketAlert[];
  volumeLeaders: VolumeLeader[];
  scannedAt: string;
  marketSession: "premarket" | "regular" | "afterhours" | "closed";
}

export interface NewsArticle {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: Date;
  summary?: string;
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
