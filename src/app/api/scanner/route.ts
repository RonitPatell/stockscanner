import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getCachedScannerSnapshot } from "@/lib/market-scanner";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Pro scanner read API — cache only.
 * Does NOT connect market-data providers, rebuild the symbol universe,
 * or warm the Monitor snapshot. Warming is cron/worker-owned.
 */
export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`scanner:${gate.user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many scanner requests" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const cached = await getCachedScannerSnapshot();
    if (cached) {
      return NextResponse.json({
        ...cached,
        workerOwned: true,
      });
    }

    return NextResponse.json(
      {
        alerts: [],
        volumeLeaders: [],
        scannedAt: new Date().toISOString(),
        marketSession: "closed",
        stale: true,
        workerOwned: true,
        note: "Scanner snapshot not yet published by market workers",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Scanner API error:", error);
    return NextResponse.json({ error: "Scanner unavailable" }, { status: 500 });
  }
}
