import { NextResponse } from "next/server";
import { getIngestLatencyStats, getSpeedWins } from "@/lib/speed-wins";

export const dynamic = "force-dynamic";

/** Public feed of recent speed wins — marketing + social proof */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));
  const hours = Math.min(336, Number(url.searchParams.get("hours") || 168));

  const sort = url.searchParams.get("sort") === "impressive" ? "impressive" : "fastest";
  const [wins, latency] = await Promise.all([
    getSpeedWins(limit, hours, sort),
    getIngestLatencyStats(24),
  ]);
  return NextResponse.json({
    wins,
    under3mRate: latency.under3mRate,
    under60sRate: latency.under60sRate,
    generatedAt: new Date().toISOString(),
  });
}
