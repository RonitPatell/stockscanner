import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { getSessionContext } from "@/domain/monitor/market-state/session";
import { restoreDeliveryCheckpoint } from "@/lib/monitor/delivery/server-hub";
import {
  tickMonitorSnapshotService,
  publishClosedMarketSnapshot,
  getActiveMonitorPublicSnapshot,
  recoverMonitorSnapshotFromDurable,
} from "@/lib/monitor/snapshot";
import { refreshSymbolMaster } from "@/lib/coverage/symbol-master";
import { refreshQuoteCache, refreshQuoteVolumes } from "@/lib/quote-cache-service";
import { refreshProfileCache } from "@/lib/profile-cache-service";
import { ACTIVE_US_TICKERS } from "@/lib/news-sources/active-tickers";
import { writeWorkerHeartbeat } from "@/lib/workers/heartbeat";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const INSTANCE = randomBytes(4).toString("hex");

const CORE_INDEX = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "VIX",
  "XLK",
  "XLF",
  "XLE",
] as const;

type WarmPhase = "premarket" | "open" | "closed" | "auto";

function resolvePhase(raw: string | null, nowMs: number): WarmPhase {
  if (raw === "premarket" || raw === "open" || raw === "closed") return raw;
  const seg = getSessionContext(nowMs).segment;
  if (seg === "closed") return "closed";
  if (seg === "premarket" || seg === "open_auction") return "premarket";
  return "open";
}

/**
 * Premarket / open / closed market warm — worker & cron only.
 * Warms symbol metadata, float profiles, previous-session quote baselines,
 * and publishes a valid Monitor snapshot before user arrival.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const nowMs = Date.now();
  const phase = resolvePhase(req.nextUrl.searchParams.get("phase"), nowMs);
  const session = getSessionContext(nowMs).segment;

  try {
    await restoreDeliveryCheckpoint().catch(() => false);

    // Symbol universe / coverage (does not run on user routes).
    let universeOk = false;
    try {
      await refreshSymbolMaster();
      universeOk = true;
    } catch {
      universeOk = false;
    }

    const warmSymbols = [
      ...CORE_INDEX,
      ...ACTIVE_US_TICKERS.slice(0, 80),
    ].map((s) => s.toUpperCase());
    const unique = [...new Set(warmSymbols)];

    let baselinesOk = false;
    try {
      await refreshQuoteCache(unique.slice(0, 64), { fetchVolume: true });
      await refreshQuoteVolumes(unique.slice(0, 40));
      await refreshProfileCache(unique.slice(0, 64));
      baselinesOk = true;
    } catch {
      baselinesOk = false;
    }

    // Ensure scanner cache is warm (delegates to scanner cron logic inline).
    try {
      const { scanMarketActivity } = await import("@/lib/market-scanner");
      await scanMarketActivity(unique.slice(0, 40), []);
    } catch {
      /* scanner warm best-effort */
    }

    let snapshotResult: unknown;
    if (phase === "closed" || session === "closed") {
      const recovered = await recoverMonitorSnapshotFromDurable();
      snapshotResult = {
        recovered,
        closed: await publishClosedMarketSnapshot(),
      };
    } else {
      snapshotResult = await tickMonitorSnapshotService();
    }

    const active = await getActiveMonitorPublicSnapshot();

    await writeWorkerHeartbeat({
      name: "monitor_market",
      updatedAtMs: Date.now(),
      instanceId: INSTANCE,
      meta: {
        providerConnected: baselinesOk,
        universeLoaded: universeOk,
        baselinesLoaded: baselinesOk,
        snapshotPublished: Boolean(active),
        session,
      },
    });

    return NextResponse.json({
      ok: true,
      phase,
      session,
      universeOk,
      baselinesOk,
      activeSnapshot: active
        ? {
            snapshotId: active.snapshotId,
            marketSession: active.marketSession,
            dataQuality: active.dataQuality,
          }
        : null,
      snapshotResult,
    });
  } catch {
    return NextResponse.json({ error: "market_warm_failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
