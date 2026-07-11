import { prisma } from "./prisma";
import { getCachedQuotes } from "./quote-cache-service";

export interface SympathyNode {
  symbol: string;
  changePercent: number | null;
  price: number | null;
  linkStrength: number;
  via: "related" | "cluster" | "co_headline";
  sampleHeadline: string | null;
}

export interface SympathyMap {
  center: string;
  nodes: SympathyNode[];
  generatedAt: string;
}

export async function getSympathyMap(
  symbol: string,
  hours = 48,
  limit = 12
): Promise<SympathyMap> {
  const center = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  if (!center) {
    return { center: "", nodes: [], generatedAt: new Date().toISOString() };
  }

  const rows = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: since },
      OR: [
        { symbol: center },
        { relatedSymbols: { has: center } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 100,
    select: {
      symbol: true,
      relatedSymbols: true,
      storyClusterId: true,
      headline: true,
      changePercent: true,
    },
  });

  const clusterIds = [
    ...new Set(rows.map((r) => r.storyClusterId).filter(Boolean) as string[]),
  ].slice(0, 20);

  const clusterPeers =
    clusterIds.length > 0
      ? await prisma.catalyst.findMany({
          where: {
            storyClusterId: { in: clusterIds },
            publishedAt: { gte: since },
            NOT: { symbol: center },
          },
          take: 80,
          select: {
            symbol: true,
            relatedSymbols: true,
            storyClusterId: true,
            headline: true,
            changePercent: true,
          },
        })
      : [];

  const strength = new Map<
    string,
    { score: number; via: SympathyNode["via"]; headline: string | null; change: number | null }
  >();

  const bump = (
    sym: string,
    pts: number,
    via: SympathyNode["via"],
    headline: string | null,
    change: number | null
  ) => {
    if (!sym || sym === center) return;
    const prev = strength.get(sym);
    if (!prev || pts > prev.score) {
      strength.set(sym, { score: pts, via, headline, change });
    } else {
      strength.set(sym, {
        ...prev,
        score: prev.score + pts * 0.35,
      });
    }
  };

  for (const r of rows) {
    if (r.symbol === center) {
      for (const rel of r.relatedSymbols ?? []) {
        bump(rel.toUpperCase(), 3, "related", r.headline, r.changePercent);
      }
    } else {
      bump(r.symbol, 2.5, "related", r.headline, r.changePercent);
    }
  }

  for (const r of clusterPeers) {
    bump(r.symbol.toUpperCase(), 2, "cluster", r.headline, r.changePercent);
    for (const rel of r.relatedSymbols ?? []) {
      bump(rel.toUpperCase(), 1.2, "co_headline", r.headline, r.changePercent);
    }
  }

  const symbols = [...strength.keys()].slice(0, 40);
  const quotes = symbols.length ? await getCachedQuotes(symbols) : {};

  const nodes: SympathyNode[] = [...strength.entries()]
    .map(([sym, meta]) => ({
      symbol: sym,
      changePercent: quotes[sym]?.changePercent ?? meta.change,
      price: quotes[sym]?.price ?? null,
      linkStrength: Math.round(meta.score * 10) / 10,
      via: meta.via,
      sampleHeadline: meta.headline,
    }))
    .sort((a, b) => {
      const am = Math.abs(a.changePercent ?? 0);
      const bm = Math.abs(b.changePercent ?? 0);
      return b.linkStrength * 2 + bm - (a.linkStrength * 2 + am);
    })
    .slice(0, limit);

  return {
    center,
    nodes,
    generatedAt: new Date().toISOString(),
  };
}

/** Top sympathy hubs from today's feed — names that appear as related most often. */
export async function getTopSympathyHubs(hours = 24, limit = 8) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: since },
    },
    take: 250,
    orderBy: { publishedAt: "desc" },
    select: {
      symbol: true,
      relatedSymbols: true,
      changePercent: true,
      headline: true,
      storyClusterId: true,
    },
  });

  const counts = new Map<string, { n: number; change: number | null; headline: string }>();
  const bump = (sym: string, change: number | null, headline: string, weight = 1) => {
    const key = sym.toUpperCase();
    if (!key || key.length > 5) return;
    const prev = counts.get(key);
    counts.set(key, {
      n: (prev?.n ?? 0) + weight,
      change: change ?? prev?.change ?? null,
      headline,
    });
  };

  for (const r of rows) {
    bump(r.symbol, r.changePercent, r.headline, 1);
    for (const rel of r.relatedSymbols ?? []) {
      bump(rel, null, r.headline, 2);
    }
  }

  // Cluster co-occurrence: symbols sharing a story cluster get linked weight
  const byCluster = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.storyClusterId) continue;
    const list = byCluster.get(r.storyClusterId) ?? [];
    list.push(r.symbol);
    byCluster.set(r.storyClusterId, list);
  }
  for (const members of byCluster.values()) {
    if (members.length < 2) continue;
    for (const s of members) bump(s, null, `${s} cluster`, 0.5);
  }

  let hubs = [...counts.entries()]
    .filter(([, v]) => v.n >= 2)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit);

  // Fallback: biggest absolute movers still make useful hubs
  if (hubs.length < 3) {
    hubs = [...counts.entries()]
      .sort((a, b) => Math.abs(b[1].change ?? 0) - Math.abs(a[1].change ?? 0))
      .slice(0, limit);
  }

  const quotes = await getCachedQuotes(hubs.map(([s]) => s));

  return hubs.map(([symbol, meta]) => ({
    symbol,
    mentions: Math.round(meta.n),
    changePercent: quotes[symbol]?.changePercent ?? meta.change,
    headline: meta.headline,
  }));
}
