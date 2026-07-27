import { getRedis } from "../redis.ts";
import type {
  AlertChannel,
  ChannelDeliveryRecord,
  DeliveryLifecycleStatus,
} from "./types.ts";

const LOG_KEY = "alertbb:delivery:log";
const LOG_MAX = 2_000;
const memoryLog: ChannelDeliveryRecord[] = [];

function recordKey(
  eventId: string,
  version: number,
  userId: string | null,
  channel: string
): string {
  return `alertbb:delivery:${eventId}:v${version}:${userId ?? "_"}:${channel}`;
}

export async function recordDeliveryLifecycle(input: {
  eventId: string;
  eventVersion: number;
  userId?: string | null;
  catalystId?: string | null;
  channel: AlertChannel;
  status: DeliveryLifecycleStatus;
  error?: string | null;
  acceptedAt?: Date | null;
}): Promise<ChannelDeliveryRecord> {
  const now = new Date().toISOString();
  const key = recordKey(
    input.eventId,
    input.eventVersion,
    input.userId ?? null,
    input.channel
  );

  let existing: ChannelDeliveryRecord | null = null;
  const redis = getRedis();
  if (redis) {
    try {
      existing = (await redis.get<ChannelDeliveryRecord>(key)) ?? null;
    } catch {
      /* ignore */
    }
  }
  if (!existing) {
    existing =
      memoryLog.find(
        (r) =>
          r.eventId === input.eventId &&
          r.eventVersion === input.eventVersion &&
          r.userId === (input.userId ?? null) &&
          r.channel === input.channel
      ) ?? null;
  }

  const rec: ChannelDeliveryRecord = existing
    ? { ...existing }
    : {
        eventId: input.eventId,
        eventVersion: input.eventVersion,
        userId: input.userId ?? null,
        catalystId: input.catalystId ?? null,
        channel: input.channel,
        status: input.status,
        acceptedAt: null,
        queuedAt: null,
        deliveredAt: null,
        failedAt: null,
        acknowledgedAt: null,
        expiredAt: null,
        error: null,
        latencyMs: null,
      };

  rec.status = input.status;
  if (input.error) rec.error = input.error.slice(0, 500);
  if (input.catalystId) rec.catalystId = input.catalystId;

  switch (input.status) {
    case "accepted":
      rec.acceptedAt = input.acceptedAt?.toISOString() ?? now;
      break;
    case "queued":
      rec.queuedAt = now;
      if (!rec.acceptedAt) rec.acceptedAt = now;
      break;
    case "delivered":
      rec.deliveredAt = now;
      if (rec.acceptedAt) {
        rec.latencyMs = Date.now() - new Date(rec.acceptedAt).getTime();
      }
      break;
    case "failed":
      rec.failedAt = now;
      break;
    case "acknowledged":
      rec.acknowledgedAt = now;
      break;
    case "expired":
      rec.expiredAt = now;
      break;
  }

  memoryLog.unshift(rec);
  if (memoryLog.length > LOG_MAX) memoryLog.length = LOG_MAX;

  if (redis) {
    try {
      await redis.set(key, rec, { ex: 7 * 24 * 3600 });
      await redis.lpush(LOG_KEY, JSON.stringify(rec));
      await redis.ltrim(LOG_KEY, 0, LOG_MAX - 1);
      await redis.expire(LOG_KEY, 7 * 24 * 3600);
    } catch {
      /* ignore */
    }
  }

  return rec;
}

export async function listRecentDeliveries(
  limit = 100
): Promise<ChannelDeliveryRecord[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const rows = await redis.lrange(LOG_KEY, 0, limit - 1);
      return (rows ?? [])
        .map((r) => {
          try {
            return typeof r === "string"
              ? (JSON.parse(r) as ChannelDeliveryRecord)
              : (r as ChannelDeliveryRecord);
          } catch {
            return null;
          }
        })
        .filter((x): x is ChannelDeliveryRecord => !!x);
    } catch {
      /* memory */
    }
  }
  return memoryLog.slice(0, limit);
}

export async function channelSuccessRates(
  hours = 24
): Promise<Record<string, { sent: number; failed: number; rate: number | null }>> {
  const since = Date.now() - hours * 3600_000;
  const rows = await listRecentDeliveries(LOG_MAX);
  const agg: Record<string, { sent: number; failed: number }> = {};
  for (const r of rows) {
    const t = r.deliveredAt ?? r.failedAt ?? r.acceptedAt;
    if (!t || new Date(t).getTime() < since) continue;
    if (!agg[r.channel]) agg[r.channel] = { sent: 0, failed: 0 };
    if (r.status === "delivered" || r.status === "acknowledged") {
      agg[r.channel].sent++;
    } else if (r.status === "failed") {
      agg[r.channel].failed++;
    }
  }
  const out: Record<
    string,
    { sent: number; failed: number; rate: number | null }
  > = {};
  for (const [ch, v] of Object.entries(agg)) {
    const total = v.sent + v.failed;
    out[ch] = {
      sent: v.sent,
      failed: v.failed,
      rate: total > 0 ? v.sent / total : null,
    };
  }
  return out;
}

export function __resetDeliveryLogForTests(): void {
  memoryLog.length = 0;
}
