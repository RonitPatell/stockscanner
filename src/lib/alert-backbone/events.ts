import { createHash } from "node:crypto";
import { buildIdempotencyKey } from "../ingest/idempotency.ts";
import { getRedis } from "../redis.ts";
import type { AlertEventEnvelope, AlertQueueClass } from "./types.ts";

const EVENT_KEY_PREFIX = "alertbb:event:";
const VERSION_KEY_PREFIX = "alertbb:eventver:";
const IDEMPOTENCY_PREFIX = "alertbb:idemp:";
const memoryEvents = new Map<string, AlertEventEnvelope>();
const memoryVersions = new Map<string, number>();
const memoryIdemp = new Set<string>();

export function buildAlertEventId(input: {
  providerItemId?: string | null;
  url?: string | null;
  title: string;
  ticker: string;
  publishedAt?: Date | null;
}): string {
  return `evt_${buildIdempotencyKey(input)}`;
}

export function buildChannelIdempotencyKey(input: {
  eventId: string;
  version: number;
  userId: string;
  channel: string;
}): string {
  return createHash("sha256")
    .update(
      `${input.eventId}|v${input.version}|${input.userId}|${input.channel}`
    )
    .digest("hex")
    .slice(0, 40);
}

/**
 * Claim channel delivery once. Enrichment version bumps do not re-alert
 * when claim key is scoped to eventId (version omitted for channel dedupe).
 */
export async function claimChannelDelivery(input: {
  eventId: string;
  /** When omitVersion=true, updates never create duplicate channel alerts. */
  omitVersion?: boolean;
  version: number;
  userId: string;
  channel: string;
  ttlMs?: number;
}): Promise<boolean> {
  const key =
    IDEMPOTENCY_PREFIX +
    (input.omitVersion
      ? `${input.eventId}|${input.userId}|${input.channel}`
      : buildChannelIdempotencyKey(input));
  const ttl = input.ttlMs ?? 24 * 60 * 60_000;
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(key, "1", { nx: true, px: ttl });
      return Boolean(ok);
    } catch {
      /* memory */
    }
  }
  if (memoryIdemp.has(key)) return false;
  memoryIdemp.add(key);
  return true;
}

export async function getEventVersion(eventId: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get<number>(VERSION_KEY_PREFIX + eventId);
      if (typeof v === "number") return v;
    } catch {
      /* memory */
    }
  }
  return memoryVersions.get(eventId) ?? 0;
}

export async function saveAlertEvent(
  envelope: AlertEventEnvelope
): Promise<AlertEventEnvelope> {
  memoryEvents.set(envelope.eventId, envelope);
  memoryVersions.set(envelope.eventId, envelope.version);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(EVENT_KEY_PREFIX + envelope.eventId, envelope, {
        ex: 7 * 24 * 3600,
      });
      await redis.set(VERSION_KEY_PREFIX + envelope.eventId, envelope.version, {
        ex: 7 * 24 * 3600,
      });
    } catch {
      /* ignore */
    }
  }
  return envelope;
}

export async function getAlertEvent(
  eventId: string
): Promise<AlertEventEnvelope | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<AlertEventEnvelope>(EVENT_KEY_PREFIX + eventId);
      if (raw && typeof raw === "object") return raw;
    } catch {
      /* memory */
    }
  }
  return memoryEvents.get(eventId) ?? null;
}

/** Create preliminary v1 or bump version for enrichment update. */
export async function upsertAlertEventVersion(input: {
  eventId: string;
  queue: AlertQueueClass;
  catalystId: string;
  rawNewsId: string;
  symbol: string;
  headline: string;
  source: string;
  sourceTier: string | null;
  publishedAt: string;
  timestampQuality: string | null;
  providerTimestampUnreliable: boolean;
  phase: "preliminary" | "enriched";
  enrichmentHints?: AlertEventEnvelope["enrichmentHints"];
}): Promise<AlertEventEnvelope> {
  const prev = await getEventVersion(input.eventId);
  const version =
    input.phase === "preliminary" ? Math.max(1, prev || 1) : prev + 1;
  const envelope: AlertEventEnvelope = {
    eventId: input.eventId,
    version: input.phase === "preliminary" && prev >= 1 ? prev : version,
    phase: input.phase,
    queue: input.queue,
    catalystId: input.catalystId,
    rawNewsId: input.rawNewsId,
    symbol: input.symbol,
    headline: input.headline,
    source: input.source,
    sourceTier: input.sourceTier,
    publishedAt: input.publishedAt,
    timestampQuality: input.timestampQuality,
    providerTimestampUnreliable: input.providerTimestampUnreliable,
    createdAt: new Date().toISOString(),
    enrichmentHints: input.enrichmentHints,
    attempt: 1,
  };
  // First preliminary wins version 1; enrichments always increment
  if (input.phase === "preliminary") {
    if (prev >= 1) {
      const existing = await getAlertEvent(input.eventId);
      if (existing) return existing;
      envelope.version = 1;
    } else {
      envelope.version = 1;
    }
  } else {
    envelope.version = Math.max(2, prev + 1);
  }
  return saveAlertEvent(envelope);
}

export function mapSourceToQueue(input: {
  source: string;
  sourceTier?: string | null;
  isSec?: boolean;
  isMarketEvent?: boolean;
}): AlertQueueClass {
  if (input.isMarketEvent) return "market_events";
  if (input.isSec || /sec\s*edgar/i.test(input.source)) return "primary_filings";
  const tier = (input.sourceTier ?? "").toLowerCase();
  if (tier === "tier0" || tier === "tier_0" || tier === "wire") {
    return "licensed_news";
  }
  if (tier === "tier1" || tier === "tier_1" || /benzinga|finnhub/i.test(input.source)) {
    return "licensed_news";
  }
  return "editorial_news";
}

export function isProviderTimestampUnreliable(
  quality: string | null | undefined
): boolean {
  if (!quality) return true;
  return (
    quality === "MISSING" ||
    quality === "INVALID" ||
    quality === "ESTIMATED_PROVIDER" ||
    quality === "ARTICLE_UPDATED_TIME"
  );
}

export function __resetAlertEventsForTests(): void {
  memoryEvents.clear();
  memoryVersions.clear();
  memoryIdemp.clear();
}
