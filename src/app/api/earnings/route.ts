import { NextRequest, NextResponse } from "next/server";
import { fetchUpcomingEarningsBatch } from "@/lib/earnings-calendar";
import { isValidTickerFormat } from "@/lib/ticker-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    const max = Math.min(
      10,
      Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 10) || 10)
    );
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && isValidTickerFormat(s))
      .slice(0, max);

    const events = symbols.length
      ? await fetchUpcomingEarningsBatch(symbols, max)
      : [];

    return NextResponse.json({
      events,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Earnings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch earnings" },
      { status: 500 }
    );
  }
}

