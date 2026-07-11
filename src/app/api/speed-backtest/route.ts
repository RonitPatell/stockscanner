import { NextResponse } from "next/server";
import { runSpeedBacktest } from "@/lib/speed-backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Candle-verified speed edge (Finnhub 1m bars). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(8, Number(url.searchParams.get("limit") || 5));
  const hours = Math.min(72, Number(url.searchParams.get("hours") || 36));
  const result = await runSpeedBacktest(limit, hours);
  return NextResponse.json(result);
}
