import { NextResponse } from "next/server";
import { getSpeedWins } from "@/lib/speed-wins";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Public “who caught it” board — speed wins + recent call board activity */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(168, Number(url.searchParams.get("hours") || 72));
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));

  const [wins, calls] = await Promise.all([
    getSpeedWins(limit, hours, "impressive"),
    prisma.traderCall.findMany({
      where: { createdAt: { gte: new Date(Date.now() - hours * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { displayName: true, symbol: true, bias: true, createdAt: true },
    }),
  ]);

  const callerCounts = new Map<string, number>();
  for (const c of calls) {
    callerCounts.set(c.displayName, (callerCounts.get(c.displayName) ?? 0) + 1);
  }
  const topCallers = [...callerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    catches: wins.map((w) => ({
      id: w.id,
      symbol: w.symbol,
      headline: w.headline,
      ingestDelaySec: w.ingestDelaySec,
      changePercent: w.changePercent,
      source: w.source,
      publishedAt: w.publishedAt,
    })),
    topCallers,
    generatedAt: new Date().toISOString(),
  });
}
