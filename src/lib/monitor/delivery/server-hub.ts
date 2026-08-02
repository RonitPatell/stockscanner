/**
 * Process-local Monitor Delivery Hub + optional Redis checkpoint for worker recovery.
 * Calculations run here — not in every browser.
 */

import { getRedis } from "@/lib/redis";
import {
  MonitorDeliveryHub,
  type DeliveryCheckpoint,
  type DeliveryHubConfig,
  type NormalizedMarketEvent,
} from "@/domain/monitor/delivery";

const CHECKPOINT_KEY = "tt:monitor:delivery:v1:checkpoint";
const METRICS_KEY = "tt:monitor:delivery:v1:metrics";

const g = globalThis as typeof globalThis & {
  __ttMonitorDeliveryHub?: MonitorDeliveryHub;
};

export function getMonitorDeliveryHub(
  config?: Partial<DeliveryHubConfig>
): MonitorDeliveryHub {
  if (!g.__ttMonitorDeliveryHub) {
    g.__ttMonitorDeliveryHub = new MonitorDeliveryHub(config);
  }
  return g.__ttMonitorDeliveryHub;
}

export function __resetMonitorDeliveryHubForTests(
  config?: Partial<DeliveryHubConfig>
): MonitorDeliveryHub {
  g.__ttMonitorDeliveryHub = new MonitorDeliveryHub(config);
  return g.__ttMonitorDeliveryHub;
}

export async function persistDeliveryCheckpoint(
  hub: MonitorDeliveryHub = getMonitorDeliveryHub()
): Promise<boolean> {
  const redis = getRedis();
  const cp = hub.exportCheckpoint();
  if (!redis) {
    // Memory-only recovery within process
    (g as { __ttMonitorDeliveryCheckpoint?: DeliveryCheckpoint }).__ttMonitorDeliveryCheckpoint =
      cp;
    return true;
  }
  try {
    await redis.set(CHECKPOINT_KEY, cp, { ex: 24 * 3600 });
    await redis.set(METRICS_KEY, hub.metrics(), { ex: 3600 });
    return true;
  } catch {
    return false;
  }
}

export async function restoreDeliveryCheckpoint(
  hub: MonitorDeliveryHub = getMonitorDeliveryHub()
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    const mem = (g as { __ttMonitorDeliveryCheckpoint?: DeliveryCheckpoint })
      .__ttMonitorDeliveryCheckpoint;
    if (!mem) return false;
    hub.restoreCheckpoint(mem);
    return true;
  }
  try {
    const cp = await redis.get<DeliveryCheckpoint>(CHECKPOINT_KEY);
    if (!cp || typeof cp !== "object" || !Array.isArray(cp.symbols)) return false;
    hub.restoreCheckpoint(cp);
    return true;
  } catch {
    return false;
  }
}

/** Ingest + process a batch (worker / cron). */
export async function ingestAndProcessMonitorEvents(
  events: NormalizedMarketEvent[],
  opts?: { persist?: boolean; maxBatch?: number }
): Promise<{ accepted: number; processed: number }> {
  const hub = getMonitorDeliveryHub();
  const accepted = hub.offerSourceEvents(events);
  const processed = hub.process(opts?.maxBatch ?? 2_000);
  if (opts?.persist !== false) {
    await persistDeliveryCheckpoint(hub);
  }
  return { accepted, processed };
}

/** Synthetic load generator for staging tests — not raw tick redistribution. */
export function synthesizeNormalizedBurst(opts: {
  symbolCount: number;
  events: number;
  hotSymbol?: string;
  baseMs?: number;
}): NormalizedMarketEvent[] {
  const base = opts.baseMs ?? Date.now();
  const hot = (opts.hotSymbol ?? "HOT1").toUpperCase();
  const out: NormalizedMarketEvent[] = [];
  for (let i = 0; i < opts.events; i++) {
    const isHot = i % 7 === 0;
    const sym = isHot
      ? hot
      : `S${String(i % opts.symbolCount).padStart(4, "0")}`;
    out.push({
      symbol: sym,
      observedAtMs: base + i,
      ingestedAtMs: base + i + 2,
      price: 1 + (i % 100) / 50,
      changePercent: ((i % 21) - 10) / 2,
      relativeVolume: isHot ? 12 : 1 + (i % 5),
      tradesPerSecond: isHot ? 80 : 2 + (i % 10),
      halted: i % 2000 === 0,
      criticalEvent: i % 1500 === 0,
      momentumState: isHot ? "BREAKING" : i % 5 === 0 ? "BUILDING" : "QUIET",
      momentumIntensity: isHot ? 0.9 : (i % 10) / 12,
      direction: isHot ? "up" : "neutral",
      availability: "ok",
    });
  }
  return out;
}
