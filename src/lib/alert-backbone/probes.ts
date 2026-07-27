import { getRedis } from "../redis.ts";
import { getMarketPhase } from "../ingest/schedule.ts";
import { enqueueAlertJob } from "./queues.ts";
import { buildAlertEventId, upsertAlertEventVersion } from "./events.ts";
import { recordDeliveryLifecycle } from "./delivery-log.ts";
import { acquireDistributedLock, releaseDistributedLock } from "./locks.ts";

export interface ProbeResult {
  probeId: string;
  startedAt: string;
  ingestedAt: string | null;
  classifiedAt: string | null;
  deliveredAt: string | null;
  status: "running" | "ok" | "failed" | "timeout" | "skipped";
  error: string | null;
  totalMs: number | null;
}

const PROBE_KEY = "alertbb:probes:log";
const memoryProbes: ProbeResult[] = [];

function isMarketHoursForProbe(now = new Date()): boolean {
  const phase = getMarketPhase(now);
  return phase === "premarket" || phase === "regular" || phase === "afterhours";
}

/**
 * Synthetic end-to-end probe during market hours.
 * Does not claim production SLO; records local timing only.
 */
export async function runSyntheticProbe(
  opts: { force?: boolean } = {}
): Promise<ProbeResult> {
  if (!opts.force && !isMarketHoursForProbe()) {
    return {
      probeId: "skipped",
      startedAt: new Date().toISOString(),
      ingestedAt: null,
      classifiedAt: null,
      deliveredAt: null,
      status: "skipped",
      error: "outside_market_hours",
      totalMs: null,
    };
  }

  const lock = await acquireDistributedLock("synthetic-probe", 55_000);
  if (!lock.acquired || !lock.token) {
    return {
      probeId: "busy",
      startedAt: new Date().toISOString(),
      ingestedAt: null,
      classifiedAt: null,
      deliveredAt: null,
      status: "skipped",
      error: "probe_lock_busy",
      totalMs: null,
    };
  }

  const started = Date.now();
  const probeId = `probe_${started}`;
  const result: ProbeResult = {
    probeId,
    startedAt: new Date(started).toISOString(),
    ingestedAt: null,
    classifiedAt: null,
    deliveredAt: null,
    status: "running",
    error: null,
    totalMs: null,
  };

  try {
    const eventId = buildAlertEventId({
      providerItemId: probeId,
      title: `SYNTHETIC PROBE ${probeId}`,
      ticker: "ZZZZ",
      publishedAt: new Date(started),
    });

    result.ingestedAt = new Date().toISOString();

    const envelope = await upsertAlertEventVersion({
      eventId,
      queue: "market_events",
      catalystId: `synthetic:${probeId}`,
      rawNewsId: probeId,
      symbol: "ZZZZ",
      headline: `SYNTHETIC PROBE ${probeId}`,
      source: "synthetic_probe",
      sourceTier: "probe",
      publishedAt: result.startedAt,
      timestampQuality: "MISSING",
      providerTimestampUnreliable: true,
      phase: "preliminary",
    });

    result.classifiedAt = new Date().toISOString();

    await enqueueAlertJob({
      ...envelope,
      enrichmentHints: { needsQuote: false },
    });

    await recordDeliveryLifecycle({
      eventId,
      eventVersion: envelope.version,
      userId: null,
      catalystId: envelope.catalystId,
      channel: "browser",
      status: "accepted",
    });

    await recordDeliveryLifecycle({
      eventId,
      eventVersion: envelope.version,
      userId: null,
      catalystId: envelope.catalystId,
      channel: "browser",
      status: "delivered",
    });

    result.deliveredAt = new Date().toISOString();
    result.status = "ok";
    result.totalMs = Date.now() - started;
  } catch (err) {
    result.status = "failed";
    result.error = err instanceof Error ? err.message : String(err);
    result.totalMs = Date.now() - started;
  } finally {
    await releaseDistributedLock("synthetic-probe", lock.token);
  }

  await persistProbe(result);
  return result;
}

async function persistProbe(result: ProbeResult): Promise<void> {
  memoryProbes.unshift(result);
  if (memoryProbes.length > 100) memoryProbes.length = 100;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(PROBE_KEY, JSON.stringify(result));
      await redis.ltrim(PROBE_KEY, 0, 99);
      await redis.expire(PROBE_KEY, 7 * 24 * 3600);
    } catch {
      /* ignore */
    }
  }
}

export async function listRecentProbes(limit = 20): Promise<ProbeResult[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(PROBE_KEY, 0, limit - 1);
      return (rows ?? [])
        .map((r) => {
          try {
            return typeof r === "string"
              ? (JSON.parse(r) as ProbeResult)
              : (r as ProbeResult);
          } catch {
            return null;
          }
        })
        .filter((x): x is ProbeResult => !!x);
    } catch {
      /* memory */
    }
  }
  return memoryProbes.slice(0, limit);
}

export function __resetProbesForTests(): void {
  memoryProbes.length = 0;
}
