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
  isPremarket?: boolean;
  historicalAvgMove?: number | null;
  historicalSampleSize?: number | null;
  catalystType?: string | null;
  urgencyScore?: number | null;
}

export interface ScannerFilters {
  minSentiment?: number;
  maxSentiment?: number;
  catalystTypes?: string[];
  premarketOnly?: boolean;
  minUrgency?: number;
  search?: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  floatShares?: number;
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
