import type { CatalystItem, CatalystHeadline } from "@/types";

/** Normalize headline for clustering similar stories across sources */
export function storyClusterKey(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|and|or|for|to|in|on|at|of|with|from|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 8)
    .join("-");
}

export interface StoryClusterView {
  clusterId: string;
  primary: CatalystItem;
  relatedHeadlines: CatalystHeadline[];
  symbols: string[];
  sources: string[];
  newsCount: number;
}

/** Attach cluster metadata without removing individual article rows */
export function attachStoryClusters(items: CatalystItem[]): CatalystItem[] {
  const byCluster = new Map<string, CatalystItem[]>();

  for (const item of items) {
    const key = item.storyClusterId ?? storyClusterKey(item.headline);
    const list = byCluster.get(key) ?? [];
    list.push(item);
    byCluster.set(key, list);
  }

  return items.map((item) => {
    const key = item.storyClusterId ?? storyClusterKey(item.headline);
    const cluster = byCluster.get(key) ?? [item];
    const sorted = [...cluster].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    const symbols = [...new Set(cluster.flatMap((c) => [c.symbol, ...(c.relatedSymbols ?? [])]))];
    const sources = [...new Set(cluster.map((c) => c.source))];
    const headlines: CatalystHeadline[] = sorted.map((c) => ({
      id: c.id,
      headline: c.headline,
      source: c.source,
      sourceUrl: c.sourceUrl,
      publishedAt: c.publishedAt,
      sentimentScore: c.sentimentScore,
      catalystType: c.catalystType,
      aiSummary: c.aiSummary,
    }));

    const primary =
      sorted.reduce((best, cur) =>
        (cur.urgencyScore ?? 0) > (best.urgencyScore ?? 0) ? cur : best
      ) ?? item;

    return {
      ...item,
      storyClusterId: key,
      headlines: headlines.length > 1 ? headlines : item.headlines,
      newsCount: cluster.length,
      relatedSymbols: symbols.filter((s) => s !== item.symbol).slice(0, 12),
      headline: primary.headline,
      aiSummary: primary.aiSummary ?? item.aiSummary,
    };
  });
}
