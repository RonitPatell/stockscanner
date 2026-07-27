import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  parseStrategy,
  simulateStrategy,
  explainStrategyMatch,
  factsFromCatalyst,
  marketSessionAt,
  type SimulationCatalystRow,
} from "@/lib/alert-strategy";
import { listStrategyVersions } from "@/lib/alert-strategy/store";
import { scrubStrategyAnalyticsProps } from "@/lib/alert-strategy/privacy";

export async function POST(req: NextRequest) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `alert-strategies:sim:${ip}:${authz.user.id}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many simulation requests" },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "simulate";

  if (action === "versions") {
    const strategyId = String(body.strategyId ?? "");
    if (!strategyId) {
      return NextResponse.json({ error: "strategyId required" }, { status: 400 });
    }
    const versions = await listStrategyVersions(authz.user.id, strategyId);
    return NextResponse.json({ versions });
  }

  const draft = parseStrategy(body.strategy);
  if (!draft) {
    return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });
  }

  if (action === "explain") {
    const symbol = String(body.symbol ?? "").toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      return NextResponse.json({ error: "Valid symbol required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authz.user.id },
      select: { watchlist: true },
    });
    const onWatchlist = Boolean(
      user?.watchlist?.some((s) => s.toUpperCase() === symbol)
    );

    let catalyst = null as Awaited<ReturnType<typeof prisma.catalyst.findFirst>>;
    if (body.catalystId) {
      catalyst = await prisma.catalyst.findFirst({
        where: { id: String(body.catalystId) },
      });
    } else {
      catalyst = await prisma.catalyst.findFirst({
        where: { symbol },
        orderBy: { publishedAt: "desc" },
      });
    }

    const facts = factsFromCatalyst(
      catalyst
        ? {
            symbol: catalyst.symbol,
            price: catalyst.price,
            floatShares: catalyst.floatShares,
            catalystType: catalyst.catalystType,
            sourceTier: catalyst.sourceTier,
            newsCount: null,
            rVol: null,
            changePercent: catalyst.changePercent,
            volume: catalyst.volume,
            publishedAt: catalyst.publishedAt.toISOString(),
          }
        : { symbol, publishedAt: new Date().toISOString() },
      {
        onWatchlist,
        marketSession: marketSessionAt(),
        dilutionFlags: [],
      }
    );

    const catalystItem = catalyst
      ? {
          id: catalyst.id,
          symbol: catalyst.symbol,
          headline: catalyst.headline,
          source: catalyst.source,
          publishedAt: catalyst.publishedAt.toISOString(),
          changePercent: catalyst.changePercent ?? undefined,
          floatShares: catalyst.floatShares ?? undefined,
          price: catalyst.price ?? undefined,
          volume: catalyst.volume ?? undefined,
          catalystType: catalyst.catalystType ?? undefined,
          sourceTier: catalyst.sourceTier ?? undefined,
          verifiedConfidence: catalyst.verifiedConfidence ?? undefined,
          urgencyScore: catalyst.urgencyScore ?? undefined,
          aiSummary: catalyst.aiSummary ?? undefined,
          keyPoints: catalyst.keyPoints ?? undefined,
          setupTags: catalyst.setupTags ?? undefined,
        }
      : null;

    const explanation = explainStrategyMatch(
      draft,
      facts,
      catalystItem as never,
      {
        userId: authz.user.id,
        checkCooldown: true,
      }
    );

    return NextResponse.json({
      explanation,
      meta: scrubStrategyAnalyticsProps({
        onWatchlist,
        hasCatalyst: Boolean(catalyst),
        symbol,
      }),
    });
  }

  const lookbackDays = Math.min(
    90,
    Math.max(1, Number(body.lookbackDays) || 14)
  );
  const maxSample = Math.min(500, Math.max(10, Number(body.maxSample) || 200));
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  const rows = await prisma.catalyst.findMany({
    where: { publishedAt: { gte: since }, quarantined: false },
    orderBy: { publishedAt: "desc" },
    take: maxSample,
    select: {
      id: true,
      symbol: true,
      headline: true,
      publishedAt: true,
      price: true,
      floatShares: true,
      catalystType: true,
      sourceTier: true,
      changePercent: true,
      volume: true,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: authz.user.id },
    select: { watchlist: true },
  });

  const simRows: SimulationCatalystRow[] = rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    headline: r.headline,
    publishedAt: r.publishedAt.toISOString(),
    price: r.price,
    floatShares: r.floatShares,
    catalystType: r.catalystType,
    sourceTier: r.sourceTier,
    changePercent: r.changePercent,
    volume: r.volume,
    factsExtras: {
      marketSession: marketSessionAt(r.publishedAt),
    },
  }));

  const result = simulateStrategy(draft, simRows, {
    watchlistSymbols: user?.watchlist ?? [],
    lookbackDays,
    maxSample,
  });

  return NextResponse.json({
    simulation: result,
    meta: scrubStrategyAnalyticsProps({
      lookbackDays,
      sampleSize: result.sampleSize,
    }),
  });
}
