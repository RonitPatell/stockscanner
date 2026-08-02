import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import {
  getMonitorDeliveryHub,
  ingestAndProcessMonitorEvents,
  persistDeliveryCheckpoint,
  restoreDeliveryCheckpoint,
  synthesizeNormalizedBurst,
} from "@/lib/monitor/delivery/server-hub";
import type { NormalizedMarketEvent } from "@/domain/monitor/delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Worker tick: ingest normalized events, process hub, persist checkpoint.
 * Fail-closed without CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      events?: NormalizedMarketEvent[];
      synthetic?: { symbolCount?: number; events?: number; hotSymbol?: string };
    };

    const hub = getMonitorDeliveryHub();

    if (body.action === "restore") {
      const ok = await restoreDeliveryCheckpoint(hub);
      return NextResponse.json({
        ok,
        metrics: hub.metrics(),
      });
    }

    if (body.action === "checkpoint") {
      const ok = await persistDeliveryCheckpoint(hub);
      return NextResponse.json({ ok, metrics: hub.metrics() });
    }

    let events = Array.isArray(body.events) ? body.events.slice(0, 5_000) : [];
    if (!events.length && body.synthetic) {
      events = synthesizeNormalizedBurst({
        symbolCount: Math.min(body.synthetic.symbolCount ?? 100, 10_000),
        events: Math.min(body.synthetic.events ?? 500, 5_000),
        hotSymbol: body.synthetic.hotSymbol,
      });
    }

    const result = await ingestAndProcessMonitorEvents(events, { persist: true });
    // Keep Redis public snapshot ahead of browser opens (best-effort).
    let snapshotPublish: unknown = null;
    try {
      const { publishMonitorSnapshotFromHub } = await import(
        "@/lib/monitor/snapshot"
      );
      snapshotPublish = await publishMonitorSnapshotFromHub({ flush: true });
    } catch {
      snapshotPublish = { ok: false };
    }
    return NextResponse.json({
      ok: true,
      ...result,
      metrics: hub.metrics(),
      snapshotPublish,
    });
  } catch {
    return NextResponse.json({ error: "monitor_delivery_tick_failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();
  const hub = getMonitorDeliveryHub();
  return NextResponse.json({ metrics: hub.metrics() });
}
