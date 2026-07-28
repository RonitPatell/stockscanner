import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import {
  mergeLiveQuotes,
  type CachedQuote,
} from "@/lib/quote-cache-service";

export const dynamic = "force-dynamic";

/**
 * Quote stream worker posts here when Redis is unavailable (memory mode).
 * Body: { quotes: Record<symbol, CachedQuote> }
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const body = await req.json().catch(() => null);
  const raw = body?.quotes;
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "quotes required" }, { status: 400 });
  }

  const quotes: Record<string, CachedQuote> = {};
  for (const [sym, q] of Object.entries(raw as Record<string, CachedQuote>)) {
    const symbol = sym.toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8);
    if (!symbol || !q || typeof q.price !== "number" || q.price <= 0) continue;
    quotes[symbol] = {
      price: q.price,
      changePercent: Number(q.changePercent) || 0,
      change: Number(q.change) || 0,
      volume: q.volume,
      avgVolume: q.avgVolume,
      rVol: q.rVol,
      floatShares: q.floatShares,
      marketCap: q.marketCap,
      dayHigh: q.dayHigh,
    };
  }

  await mergeLiveQuotes(quotes);
  return NextResponse.json({ ok: true, count: Object.keys(quotes).length });
}
