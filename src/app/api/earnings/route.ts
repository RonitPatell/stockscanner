import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import {
  fetchUpcomingEarningsBatch,
  getKnownUpcomingEarnings,
} from "@/lib/earnings-calendar";
import { isValidTickerFormat } from "@/lib/ticker-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  try {
    const raw = req.nextUrl.searchParams.get("symbols") ?? "";
    const sticky = req.nextUrl.searchParams.get("sticky") === "1";
    const max = Math.min(
      10,
      Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 10) || 10)
    );
    const symbols = raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && isValidTickerFormat(s))
      .slice(0, max);

    const fresh = symbols.length
      ? await fetchUpcomingEarningsBatch(symbols, max)
      : [];

    if (sticky) {
      const known = await getKnownUpcomingEarnings();
      const map = new Map<string, (typeof fresh)[number]>();
      for (const e of known) map.set(e.symbol, e);
      for (const e of fresh) map.set(e.symbol, e);
      const events = [...map.values()]
        .filter((e) => e.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 20);
      return NextResponse.json({ events, updatedAt: new Date().toISOString() });
    }

    return NextResponse.json({
      events: fresh,
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

