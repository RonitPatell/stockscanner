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

/** Stable key for one ticker + one story (cross-source duplicates share this). */
export function storyDedupeKey(item: Pick<CatalystItem, "symbol" | "headline" | "storyClusterId">): string {
  const cluster = item.storyClusterId ?? storyClusterKey(item.headline);
  return `${item.symbol.toUpperCase()}|${cluster || item.headline.slice(0, 40)}`;
}

export interface StoryClusterView {
  clusterId: string;
  primary: CatalystItem;
  relatedHeadlines: CatalystHeadline[];
  symbols: string[];
  sources: string[];
  newsCount: number;
}

function pickPrimary(cluster: CatalystItem[]): CatalystItem {
  return [...cluster].sort((a, b) => {
    const u = (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0);
    if (u !== 0) return u;
    const conf = (b.verifiedConfidence ?? 0) - (a.verifiedConfidence ?? 0);
    if (conf !== 0) return conf;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  })[0]!;
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

    const primary = pickPrimary(cluster);

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

/**
 * One feed row per ticker+story. Cross-source syndication becomes a single
 * row with `headlines` / `newsCount` preserved from attachStoryClusters.
 */
export function collapseStoryClusters(items: CatalystItem[]): CatalystItem[] {
  const attached = attachStoryClusters(items);
  const byKey = new Map<string, CatalystItem[]>();

  for (const item of attached) {
    const key = storyDedupeKey(item);
    const list = byKey.get(key) ?? [];
    list.push(item);
    byKey.set(key, list);
  }

  const collapsed: CatalystItem[] = [];
  for (const group of byKey.values()) {
    const primary = pickPrimary(group);
    if (group.length === 1) {
      collapsed.push(primary);
      continue;
    }

    const sorted = [...group].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    const headlineMap = new Map<string, CatalystHeadline>();
    for (const c of sorted) {
      for (const h of c.headlines ?? []) {
        if (!headlineMap.has(h.id)) headlineMap.set(h.id, h);
      }
      if (!headlineMap.has(c.id)) {
        headlineMap.set(c.id, {
          id: c.id,
          headline: c.headline,
          source: c.source,
          sourceUrl: c.sourceUrl,
          publishedAt: c.publishedAt,
          sentimentScore: c.sentimentScore,
          catalystType: c.catalystType,
          aiSummary: c.aiSummary,
        });
      }
    }
    const headlines = [...headlineMap.values()];
    const sources = [...new Set(sorted.map((c) => c.source))];
    const related = [
      ...new Set(sorted.flatMap((c) => c.relatedSymbols ?? [])),
    ].filter((s) => s !== primary.symbol);

    collapsed.push({
      ...primary,
      headlines: headlines.length > 1 ? headlines : primary.headlines,
      newsCount: Math.max(primary.newsCount ?? 0, headlines.length, group.length),
      relatedSymbols: related.slice(0, 12),
      // Prefer richest summary / best confidence across duplicates
      aiSummary:
        sorted.find((c) => c.aiSummary)?.aiSummary ?? primary.aiSummary,
      keyPoints:
        sorted.find((c) => c.keyPoints && c.keyPoints.length > 0)?.keyPoints ??
        primary.keyPoints,
      verifiedConfidence: Math.max(
        ...sorted.map((c) => c.verifiedConfidence ?? 0),
        primary.verifiedConfidence ?? 0
      ),
      source: sources[0] ?? primary.source,
    });
  }

  // Preserve newest-first order of primaries
  return collapsed.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
