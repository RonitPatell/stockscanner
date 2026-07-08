import type { CatalystHeadline, CatalystItem } from "@/types";
import { sortByRecency } from "./movers";

function scoreToLabel(score: number): string {
  if (score >= 40) return "very_bullish";
  if (score >= 20) return "bullish";
  if (score <= -40) return "very_bearish";
  if (score <= -20) return "bearish";
  return "neutral";
}

/** Recency-weighted average — newer headlines count more */
function aggregateSentiment(items: CatalystItem[]): number {
  const now = Date.now();
  let totalWeight = 0;
  let weightedSum = 0;

  for (const item of items) {
    const ageHours = (now - new Date(item.publishedAt).getTime()) / 3_600_000;
    const weight = 1 / (1 + ageHours * 0.4);
    weightedSum += (item.sentimentScore ?? 0) * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

function toHeadline(item: CatalystItem): CatalystHeadline {
  return {
    id: item.id,
    headline: item.headline,
    source: item.source,
    sourceUrl: item.sourceUrl,
    publishedAt: item.publishedAt,
    sentimentScore: item.sentimentScore,
    catalystType: item.catalystType,
    aiSummary: item.aiSummary,
  };
}

export function groupCatalystsBySymbol(items: CatalystItem[]): CatalystItem[] {
  const bySymbol = new Map<string, CatalystItem[]>();

  for (const item of items) {
    const list = bySymbol.get(item.symbol) ?? [];
    list.push(item);
    bySymbol.set(item.symbol, list);
  }

  const grouped: CatalystItem[] = [];

  for (const [symbol, symbolItems] of bySymbol) {
    const sorted = [...symbolItems].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    const latest = sorted[0];
    const headlines = sorted.map(toHeadline);
    const sentimentScore = aggregateSentiment(sorted);
    const urgencyScore = Math.max(...sorted.map((i) => i.urgencyScore ?? 0));
    const dominant = sorted.reduce((best, cur) =>
      (cur.urgencyScore ?? 0) > (best.urgencyScore ?? 0) ? cur : best
    );

    const volume = sorted.reduce((best, cur) =>
      (cur.volume ?? 0) > (best.volume ?? 0) ? cur : best
    );
    const maxRvol = Math.max(...sorted.map((i) => i.rVol ?? 0));

    grouped.push({
      ...latest,
      id: sorted.length === 1 ? latest.id : `group-${symbol}`,
      symbol,
      headline: latest.headline,
      headlines,
      newsCount: sorted.length,
      sentimentScore,
      sentimentLabel: scoreToLabel(sentimentScore),
      urgencyScore,
      catalystType: dominant.catalystType ?? latest.catalystType,
      isPremarket: sorted.some((i) => i.isPremarket),
      publishedAt: latest.publishedAt,
      volume: volume.volume ?? latest.volume,
      avgVolume: volume.avgVolume ?? latest.avgVolume,
      rVol: maxRvol > 0 ? maxRvol : latest.rVol,
    });
  }

  return grouped.sort(sortByRecency);
}
