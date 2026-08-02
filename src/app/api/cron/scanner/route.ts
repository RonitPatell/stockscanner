import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import {
  scanMarketActivity,
  type CatalystScanHint,
} from "@/lib/market-scanner";
import { prisma } from "@/lib/prisma";
import { isValidTickerFormat } from "@/lib/ticker-utils";
import { isKnownFalsePositive } from "@/lib/news-verifier";
import { writeWorkerHeartbeat } from "@/lib/workers/heartbeat";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INSTANCE = randomBytes(4).toString("hex");

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

/**
 * Worker/cron-owned scanner warm. User `/api/scanner` is read-only.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  try {
    const hints = await loadCatalystHints();
    const snapshot = await scanMarketActivity(
      hints.map((h) => h.symbol),
      hints
    );
    await writeWorkerHeartbeat({
      name: "scanner_warm",
      updatedAtMs: Date.now(),
      instanceId: INSTANCE,
      meta: {
        universeLoaded: true,
        snapshotPublished: Boolean(
          snapshot.alerts?.length || snapshot.volumeLeaders?.length
        ),
      },
    });
    return NextResponse.json({
      ok: true,
      alerts: snapshot.alerts?.length ?? 0,
      volumeLeaders: snapshot.volumeLeaders?.length ?? 0,
      session: snapshot.marketSession ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "scanner_warm_failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
