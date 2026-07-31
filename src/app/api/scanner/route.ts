import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import {
  getCachedScannerSnapshot,
  scanMarketActivity,
  type CatalystScanHint,
} from "@/lib/market-scanner";
import { prisma } from "@/lib/prisma";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isKnownFalsePositive } from "@/lib/news-verifier";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function loadCatalystHints(): Promise<CatalystScanHint[]> {
  try {
    let catalystHints = await prisma.catalyst.findMany({
      select: {
        symbol: true,
        price: true,
        changePercent: true,
        headline: true,
        publishedAt: true,
        volume: true,
        avgVolume: true,
      },
      where: {
        publishedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { publishedAt: "desc" },
      take: 120,
    });
    catalystHints = catalystHints.filter(
      (h) =>
        isValidTickerFormat(h.symbol) &&
        !isKnownFalsePositive(h.symbol, h.headline) &&
        h.price != null &&
        h.changePercent != null
    );

    const seen = new Set<string>();
    return catalystHints.filter((h) => {
      if (seen.has(h.symbol)) return false;
      seen.add(h.symbol);
      return true;
    });
  } catch {
    return [];
  }
}

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
    const hasCached =
      cached && (cached.alerts.length > 0 || cached.volumeLeaders.length > 0);

    if (hasCached) {
      // Refresh in background — client already has something to paint
      void (async () => {
        try {
          const hints = await loadCatalystHints();
          await scanMarketActivity(
            hints.map((h) => h.symbol),
            hints
          );
        } catch {
          /* ignore */
        }
      })();
      return NextResponse.json(cached);
    }

    const catalystHints = await loadCatalystHints();
    const snapshot = await scanMarketActivity(
      catalystHints.map((h) => h.symbol),
      catalystHints
    );
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Scanner API error:", error);
    return NextResponse.json({ error: "Scanner failed" }, { status: 500 });
  }
}
