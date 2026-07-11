import { prisma } from "./prisma";
import { getCachedQuotes } from "./quote-cache-service";

export interface SpeedWin {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  ingestedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
  catalystType: string | null;
  urgencyScore: number | null;
  /** Higher = more impressive for marketing sort */
  score: number;
}

export type SpeedWinSort = "fastest" | "impressive";

function impressiveness(
  delaySec: number,
  changePercent: number | null,
  urgency: number | null
): number {
  const move = Math.abs(changePercent ?? 0);
  const speedBonus = Math.max(0, 600 - delaySec) / 600;
  const moveBonus = Math.min(move / 25, 1);
  const urgencyBonus = (urgency ?? 0) / 100;
  return speedBonus * 0.45 + moveBonus * 0.35 + urgencyBonus * 0.2;
}

export async function getSpeedWins(
  limit = 12,
  hours = 168,
  sort: SpeedWinSort = "impressive"
): Promise<SpeedWin[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      publishedAt: true,
      createdAt: true,
      changePercent: true,
      catalystType: true,
      urgencyScore: true,
      verifiedConfidence: true,
    },
  });

  const quoteSymbols = [
    ...new Set(rows.filter((r) => r.changePercent == null).map((r) => r.symbol)),
  ];
  const quotes = quoteSymbols.length > 0 ? await getCachedQuotes(quoteSymbols) : {};

  const wins: SpeedWin[] = [];

  for (const r of rows) {
    const delaySec = Math.max(
      0,
      Math.round((r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
    );
    const changePercent = r.changePercent ?? quotes[r.symbol]?.changePercent ?? null;
    const move = Math.abs(changePercent ?? 0);

    if (delaySec > 600) continue;
    if ((r.verifiedConfidence ?? 15) < 15) continue;

    // Fast catches (≤3 min) always qualify; slower ones need a move or urgency
    if (delaySec > 180 && move < 2 && (r.urgencyScore ?? 0) < 35) continue;

    wins.push({
      id: r.id,
      symbol: r.symbol,
      headline: r.headline,
      source: r.source,
      publishedAt: r.publishedAt.toISOString(),
      ingestedAt: r.createdAt.toISOString(),
      ingestDelaySec: delaySec,
      changePercent,
      catalystType: r.catalystType,
      urgencyScore: r.urgencyScore,
      score:
        sort === "fastest"
          ? Math.max(0, 600 - delaySec)
          : impressiveness(delaySec, changePercent, r.urgencyScore),
    });
  }

  if (sort === "fastest") {
    return wins.sort((a, b) => a.ingestDelaySec - b.ingestDelaySec).slice(0, limit);
  }
  return wins.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface IngestLatencyStats {
  avgSec: number | null;
  p50Sec: number | null;
  p90Sec: number | null;
  sampleSize: number;
  under15sRate: number | null;
  /** Share of live catches within 60s of publish. */
  under60sRate: number | null;
  /** Share of live catches within 3 minutes — primary marketing metric. */
  under3mRate: number | null;
  /** @deprecated Use under60sRate */
  under30sRate: number | null;
  fastestSec: number | null;
}

/**
 * Latency for marketing / Caught it.
 * Only counts "live race" catches (ingest within 10 minutes of publish).
 * Hours-old RSS/Finnhub backfill is excluded — it was never a fair speed race.
 */
export async function getIngestLatencyStats(hours = 24): Promise<IngestLatencyStats> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const LIVE_RACE_MAX_SEC = 10 * 60;

  const rows = await prisma.catalyst.findMany({
    where: { createdAt: { gte: since } },
    select: { publishedAt: true, createdAt: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  const empty: IngestLatencyStats = {
    avgSec: null,
    p50Sec: null,
    p90Sec: null,
    sampleSize: 0,
    under15sRate: null,
    under60sRate: null,
    under3mRate: null,
    under30sRate: null,
    fastestSec: null,
  };

  if (rows.length === 0) return empty;

  const allDelays = rows
    .map((r) => Math.max(0, (r.createdAt.getTime() - r.publishedAt.getTime()) / 1000))
    .sort((a, b) => a - b);

  const delays = allDelays.filter((d) => d <= LIVE_RACE_MAX_SEC);
  if (delays.length === 0) {
    return { ...empty, fastestSec: allDelays[0] ?? null };
  }

  const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
  const p50 = delays[Math.floor(delays.length * 0.5)] ?? null;
  const p90 = delays[Math.floor(delays.length * 0.9)] ?? null;
  const under15 = delays.filter((d) => d <= 15).length / delays.length;
  const under60 = delays.filter((d) => d <= 60).length / delays.length;
  const under3m = delays.filter((d) => d <= 180).length / delays.length;

  const under60sRate = Math.round(under60 * 1000) / 10;
  const under3mRate = Math.round(under3m * 1000) / 10;

  return {
    avgSec: Math.round(avg * 10) / 10,
    p50Sec: Math.round((p50 ?? 0) * 10) / 10,
    p90Sec: Math.round((p90 ?? 0) * 10) / 10,
    sampleSize: delays.length,
    under15sRate: Math.round(under15 * 1000) / 10,
    under60sRate,
    under3mRate,
    under30sRate: under60sRate,
    fastestSec: delays[0] ?? null,
  };
}

export async function getCatalystsForSymbol(symbol: string, limit = 20) {
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!sym) return [];

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  return prisma.catalyst.findMany({
    where: { symbol: sym, publishedAt: { gte: cutoff } },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      publishedAt: true,
      createdAt: true,
      changePercent: true,
      catalystType: true,
      sentimentScore: true,
      setupTags: true,
      sourceTier: true,
    },
  });
}
