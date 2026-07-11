import { prisma } from "./prisma";
import { buildActionPlaybook } from "./action-playbook";
import { isDilutionCatalyst } from "./action-playbook";

export interface ReplayEvent {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  ingestedAt: string;
  ingestDelaySec: number;
  changePercent: number | null;
  catalystType: string | null;
  bias: string;
  antiFomoScore: number;
  isDilution: boolean;
  tOffsetSec: number;
}

export interface CatalystReplay {
  from: string;
  to: string;
  durationSec: number;
  eventCount: number;
  events: ReplayEvent[];
  stats: {
    dilutionCount: number;
    avgIngestSec: number | null;
    under3mRate: number | null;
    longBias: number;
    avoidBias: number;
  };
}

export async function getCatalystReplay(hours = 12, limit = 80): Promise<CatalystReplay> {
  const to = new Date();
  const from = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await prisma.catalyst.findMany({
    where: { publishedAt: { gte: from, lte: to } },
    orderBy: { publishedAt: "asc" },
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
      urgencyScore: true,
      relatedSymbols: true,
      floatShares: true,
    },
  });

  const startMs = from.getTime();
  const events: ReplayEvent[] = rows.map((r) => {
    const delaySec = Math.max(
      0,
      Math.round((r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
    );
    const playbook = buildActionPlaybook({
      ...r,
      rVol: null,
    });
    return {
      id: r.id,
      symbol: r.symbol,
      headline: r.headline,
      source: r.source,
      publishedAt: r.publishedAt.toISOString(),
      ingestedAt: r.createdAt.toISOString(),
      ingestDelaySec: delaySec,
      changePercent: r.changePercent,
      catalystType: r.catalystType,
      bias: playbook.bias,
      antiFomoScore: playbook.antiFomoScore,
      isDilution: isDilutionCatalyst(r),
      tOffsetSec: Math.max(0, Math.round((r.publishedAt.getTime() - startMs) / 1000)),
    };
  });

  const delays = events.map((e) => e.ingestDelaySec);
  const live = delays.filter((d) => d <= 600);
  const durationSec = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 1000)
  );

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    durationSec,
    eventCount: events.length,
    events,
    stats: {
      dilutionCount: events.filter((e) => e.isDilution).length,
      avgIngestSec:
        live.length > 0
          ? Math.round((live.reduce((a, b) => a + b, 0) / live.length) * 10) / 10
          : null,
      under3mRate:
        live.length > 0
          ? Math.round((live.filter((d) => d <= 180).length / live.length) * 1000) / 10
          : null,
      longBias: events.filter((e) => e.bias === "long").length,
      avoidBias: events.filter((e) => e.bias === "avoid").length,
    },
  };
}
