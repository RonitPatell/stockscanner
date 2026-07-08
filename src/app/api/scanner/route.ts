import { NextResponse } from "next/server";
import { scanMarketActivity } from "@/lib/market-scanner";
import { prisma } from "@/lib/prisma";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isKnownFalsePositive } from "@/lib/news-verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    let catalystHints: {
      symbol: string;
      price: number | null;
      changePercent: number | null;
      headline: string;
      publishedAt: Date;
    }[] = [];

    try {
      catalystHints = await prisma.catalyst.findMany({
        select: {
          symbol: true,
          price: true,
          changePercent: true,
          headline: true,
          publishedAt: true,
          volume: true,
          avgVolume: true,
        },
        orderBy: { publishedAt: "desc" },
        take: 40,
      });
      catalystHints = catalystHints.filter(
        (h) =>
          isValidTickerFormat(h.symbol) &&
          !isKnownFalsePositive(h.symbol, h.headline) &&
          h.price != null &&
          h.changePercent != null
      );

      const seen = new Set<string>();
      catalystHints = catalystHints.filter((h) => {
        if (seen.has(h.symbol)) return false;
        seen.add(h.symbol);
        return true;
      });
    } catch { /* db optional */ }

    const extraSymbols = catalystHints.map((r) => r.symbol);
    const snapshot = await scanMarketActivity(extraSymbols, catalystHints);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Scanner API error:", error);
    return NextResponse.json({ error: "Scanner failed" }, { status: 500 });
  }
}
