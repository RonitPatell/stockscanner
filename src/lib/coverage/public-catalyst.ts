import type { CatalystItem } from "@/types";
import { computeRvol } from "../volume-utils.ts";

/** Map a Prisma catalyst row to CatalystItem for preview / badges. */
export function mapPublicCatalyst(c: {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  sourceUrl?: string | null;
  publishedAt: Date;
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
  catalystType?: string | null;
  urgencyScore?: number | null;
  setupTags?: string[];
  verifiedConfidence?: number | null;
  matchMethod?: string | null;
  coverageReason?: string | null;
  quarantined?: boolean;
  keyPoints?: string[];
  sourceTier?: string | null;
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
    rVol: computeRvol(c.volume ?? null, c.avgVolume ?? null),
    isPremarket: c.isPremarket,
    catalystType: c.catalystType,
    urgencyScore: c.urgencyScore,
    setupTags: c.setupTags,
    verifiedConfidence: c.verifiedConfidence,
    matchMethod: c.matchMethod,
    coverageReason: c.coverageReason,
    quarantined: c.quarantined ?? false,
    keyPoints: c.keyPoints,
    sourceTier: c.sourceTier,
  };
}
