import { NextResponse } from "next/server";
import { getSpeedWins } from "@/lib/speed-wins";

export const dynamic = "force-dynamic";

/** Public feed of recent speed wins — marketing + social proof */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));
  const hours = Math.min(336, Number(url.searchParams.get("hours") || 168));

  const sort = url.searchParams.get("sort") === "impressive" ? "impressive" : "fastest";
  const wins = await getSpeedWins(limit, hours, sort);
  return NextResponse.json({
    wins,
    generatedAt: new Date().toISOString(),
  });
}
