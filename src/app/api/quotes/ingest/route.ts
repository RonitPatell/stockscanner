import { NextRequest, NextResponse } from "next/server";
import {
  mergeLiveQuotes,
  type CachedQuote,
} from "@/lib/quote-cache-service";

export const dynamic = "force-dynamic";

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

/**
 * Quote stream worker posts here when Redis is unavailable (memory mode).
 * Body: { quotes: Record<symbol, CachedQuote> }
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    };
  }

  await mergeLiveQuotes(quotes);
  return NextResponse.json({ ok: true, count: Object.keys(quotes).length });
}
