import { NextResponse } from "next/server";
import { authorizeCron, requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { safeHttpUrl } from "@/lib/utils";
import {
  EVENT_TAPE_CONFIG,
  MONITOR_EVENT_TAPE_VERSION,
  isMonitorTapeEventType,
  type RawTapeSignal,
} from "@/domain/monitor/event-tape";
import {
  ingestEventTape,
  listEventTape,
} from "@/lib/monitor/event-tape-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RL_GET = 90;
const WINDOW_MS = 60_000;

/**
 * GET — Pro users read the shared Monitor Event Tape (product data).
 * Never returns secrets or provider credentials.
 */
export async function GET(req: Request) {
  const auth = await requireTrustTickerAccess();
  if (auth.error) return auth.error;

  const rl = await rateLimit(
    `monitor-event-tape:get:${auth.user.id}:${clientIp(req)}`,
    RL_GET,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, RL_GET) }
    );
  }

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol")?.trim().toUpperCase() || undefined;
    const sinceRaw = url.searchParams.get("sinceMs");
    const sinceMs =
      sinceRaw && Number.isFinite(Number(sinceRaw))
        ? Number(sinceRaw)
        : undefined;
    let limit = Number(url.searchParams.get("limit") ?? EVENT_TAPE_CONFIG.defaultListLimit);
    if (!Number.isFinite(limit) || limit < 1) {
      limit = EVENT_TAPE_CONFIG.defaultListLimit;
    }
    limit = Math.min(Math.floor(limit), EVENT_TAPE_CONFIG.maxListLimit);

    const items = await listEventTape({ sinceMs, limit, symbol });
    return NextResponse.json({
      version: MONITOR_EVENT_TAPE_VERSION,
      count: items.length,
      items,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load event tape" },
      { status: 500 }
    );
  }
}

/**
 * POST — Cron/worker ingest of normalized raw signals.
 * Fail-closed via authorizeCron.
 */
export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { signals?: unknown };
    if (!Array.isArray(body.signals)) {
      return NextResponse.json(
        { error: "signals array required" },
        { status: 400 }
      );
    }

    const signals: RawTapeSignal[] = [];
    for (const raw of body.signals.slice(0, 500)) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      const type = String(s.type ?? "");
      if (!isMonitorTapeEventType(type)) continue;
      const symbol = String(s.symbol ?? "").trim();
      const atMs = Number(s.atMs);
      if (!symbol || !Number.isFinite(atMs)) continue;
      const url =
        typeof s.sourceUrl === "string" ? safeHttpUrl(s.sourceUrl.slice(0, 500)) : null;
      signals.push({
        type,
        symbol,
        atMs,
        detail: typeof s.detail === "string" ? s.detail.slice(0, 400) : null,
        dataConfidence:
          typeof s.dataConfidence === "string"
            ? (s.dataConfidence as RawTapeSignal["dataConfidence"])
            : undefined,
        sourceName:
          typeof s.sourceName === "string" ? s.sourceName.slice(0, 120) : null,
        sourceUrl: url,
        id: typeof s.id === "string" ? s.id.slice(0, 128) : undefined,
      });
    }

    const result = await ingestEventTape(signals);
    return NextResponse.json({
      version: MONITOR_EVENT_TAPE_VERSION,
      accepted: result.accepted.length,
      dropped: result.dropped.length,
      clustersUpdated: result.clustersUpdated.length,
      acceptedIds: result.accepted.map((a) => a.id),
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to ingest event tape" },
      { status: 500 }
    );
  }
}
