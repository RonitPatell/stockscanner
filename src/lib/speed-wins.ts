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

/** Prefer true live-race catches; fall back so the UI is never empty on free RSS. */
const LIVE_RACE_MAX_SEC = 10 * 60;
const DISPLAY_MAX_SEC = 90 * 60;

function toWin(
  r: {
    id: string;
    symbol: string;
    headline: string;
    source: string;
    publishedAt: Date;
    createdAt: Date;
    changePercent: number | null;
    catalystType: string | null;
    urgencyScore: number | null;
  },
  delaySec: number,
  changePercent: number | null,
  sort: SpeedWinSort
): SpeedWin {
  return {
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
        ? Math.max(0, DISPLAY_MAX_SEC - delaySec)
        : impressiveness(delaySec, changePercent, r.urgencyScore),
  };
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

  const strict: SpeedWin[] = [];
  const fallback: SpeedWin[] = [];

  for (const r of rows) {
    const delaySec = Math.max(
      0,
      Math.round((r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
    );
    const changePercent = r.changePercent ?? quotes[r.symbol]?.changePercent ?? null;
    const move = Math.abs(changePercent ?? 0);

    if ((r.verifiedConfidence ?? 15) < 15) continue;
    if (delaySec > DISPLAY_MAX_SEC) continue;

    const win = toWin(r, delaySec, changePercent, sort);

    // Live-race quality bar
    if (delaySec <= LIVE_RACE_MAX_SEC) {
      if (delaySec > 180 && move < 2 && (r.urgencyScore ?? 0) < 35) {
        fallback.push(win);
        continue;
      }
      strict.push(win);
      continue;
    }

    // Slower RSS catches — still useful proof when wire is quiet
    fallback.push(win);
  }

  const pool = strict.length > 0 ? strict : fallback;

  if (sort === "fastest") {
    return pool.sort((a, b) => a.ingestDelaySec - b.ingestDelaySec).slice(0, limit);
  }
  return pool.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface IngestLatencyStats {
  avgSec: number | null;
  p50Sec: number | null;
  p90Sec: number | null;
  sampleSize: number;
  under15sRate: number | null;
  under60sRate: number | null;
  /** Desk processing under 30s (preferred public bar). */
  under30sRate: number | null;
  /**
   * @deprecated Older clients — mirrors under60sRate (desk/wire speed),
   * not blended editorial RSS publish-age.
   */
  under3mRate: number | null;
  fastestSec: number | null;
  /** What the numbers measure — never blend editorial RSS publish-age into this. */
  metric: "desk_processing" | "wire_catch" | "insufficient_samples";
  note: string;
}

const WIRE_SOURCES = [
  "GlobeNewswire",
  "Business Wire",
  "PR Newswire",
  "SEC EDGAR",
  "Yahoo Finance",
] as const;

function packDelayStats(
  delaysSec: number[]
): Omit<IngestLatencyStats, "metric" | "note"> {
  const delays = [...delaysSec].sort((a, b) => a - b);
  const empty = {
    avgSec: null as number | null,
    p50Sec: null as number | null,
    p90Sec: null as number | null,
    sampleSize: 0,
    under15sRate: null as number | null,
    under60sRate: null as number | null,
    under3mRate: null as number | null,
    under30sRate: null as number | null,
    fastestSec: null as number | null,
  };
  if (delays.length === 0) return empty;

  const avg = delays.reduce((a, b) => a + b, 0) / delays.length;
  const p50 = delays[Math.floor(delays.length * 0.5)] ?? null;
  const p90 = delays[Math.floor(delays.length * 0.9)] ?? null;
  const under15 = delays.filter((d) => d <= 15).length / delays.length;
  const under30 = delays.filter((d) => d <= 30).length / delays.length;
  const under60 = delays.filter((d) => d <= 60).length / delays.length;
  const under60sRate = Math.round(under60 * 1000) / 10;

  return {
    avgSec: Math.round(avg * 10) / 10,
    p50Sec: Math.round((p50 ?? 0) * 10) / 10,
    p90Sec: Math.round((p90 ?? 0) * 10) / 10,
    sampleSize: delays.length,
    under15sRate: Math.round(under15 * 1000) / 10,
    under60sRate,
    under30sRate: Math.round(under30 * 1000) / 10,
    under3mRate: under60sRate,
    fastestSec: delays[0] ?? null,
  };
}

/**
 * Public desk-speed stats — TrustTicker processing / wire catch only.
 * Never averages editorial RSS publish→DB age (that produced bogus ~49m "ingest" numbers).
 */
export async function getIngestLatencyStats(
  hours = 24
): Promise<IngestLatencyStats> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
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
    metric: "insufficient_samples",
    note: "Not enough wire samples in the last 24h yet.",
  };

  const traces = await prisma.latencyTrace.findMany({
    where: {
      createdAt: { gte: since },
      metricCohort: { in: ["actionable_breaking", "urgent_filing"] },
      processingLatencyMs: { not: null },
      NOT: { timestampQuality: { in: ["MISSING", "INVALID"] } },
    },
    select: { processingLatencyMs: true },
    take: 2_000,
    orderBy: { createdAt: "desc" },
  });

  const processingSec = traces
    .map((t) => (t.processingLatencyMs ?? NaN) / 1000)
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 120);

  if (processingSec.length >= 8) {
    return {
      ...packDelayStats(processingSec),
      metric: "desk_processing",
      note: "Median TrustTicker processing time after a wire item is fetched (PR/SEC/breaking). Not publisher RSS age.",
    };
  }

  const rows = await prisma.catalyst.findMany({
    where: {
      createdAt: { gte: since },
      source: { in: [...WIRE_SOURCES] },
      quarantined: false,
    },
    select: { publishedAt: true, createdAt: true },
    take: 2_000,
    orderBy: { createdAt: "desc" },
  });

  const WIRE_CATCH_CAP_SEC = 10 * 60;
  const catchSec = rows
    .map((r) =>
      Math.max(0, (r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
    )
    .filter((d) => Number.isFinite(d) && d <= WIRE_CATCH_CAP_SEC);

  if (catchSec.length >= 8) {
    return {
      ...packDelayStats(catchSec),
      metric: "wire_catch",
      note: "PR/SEC/Yahoo catch delay (publish → desk), capped at 10m. Editorial RSS excluded.",
    };
  }

  if (processingSec.length > 0) {
    return {
      ...packDelayStats(processingSec),
      metric: "desk_processing",
      note: "Limited sample — TrustTicker processing after fetch.",
    };
  }

  if (catchSec.length > 0) {
    return {
      ...packDelayStats(catchSec),
      metric: "wire_catch",
      note: "Limited sample — wire catch only.",
    };
  }

  return empty;
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
