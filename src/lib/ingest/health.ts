import { getRedis } from "../redis.ts";
import type { IngestTier, SourceHealthStatus, CircuitState } from "./types.ts";

type HealthRecord = {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  lastResponseMs: number | null;
  lastItemsReceived: number;
  lastError: string | null;
  circuit: CircuitState;
  nextEligibleAt: number | null;
};

const memory = new Map<string, HealthRecord>();

function key(sourceId: string): string {
  return `ingest:health:${sourceId}`;
}

function empty(): HealthRecord {
  return {
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    lastResponseMs: null,
    lastItemsReceived: 0,
    lastError: null,
    circuit: "closed",
    nextEligibleAt: null,
  };
}

async function load(sourceId: string): Promise<HealthRecord> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<HealthRecord>(key(sourceId));
      if (raw && typeof raw === "object") return { ...empty(), ...raw };
    } catch {
      /* memory */
    }
  }
  return memory.get(sourceId) ?? empty();
}

async function save(sourceId: string, rec: HealthRecord): Promise<void> {
  memory.set(sourceId, rec);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key(sourceId), rec, { ex: 7 * 24 * 3600 });
    } catch {
      /* ignore */
    }
  }
}

export async function recordSourceSuccess(input: {
  sourceId: string;
  responseMs: number;
  itemsReceived: number;
}): Promise<void> {
  const rec = await load(input.sourceId);
  rec.lastSuccessAt = Date.now();
  rec.consecutiveFailures = 0;
  rec.lastResponseMs = input.responseMs;
  rec.lastItemsReceived = input.itemsReceived;
  rec.lastError = null;
  rec.circuit = "closed";
  rec.nextEligibleAt = null;
  await save(input.sourceId, rec);
}

export async function recordSourceFailure(input: {
  sourceId: string;
  responseMs?: number;
  error: string;
  consecutiveFailures: number;
  circuit: CircuitState;
  nextEligibleAt?: number | null;
}): Promise<void> {
  const rec = await load(input.sourceId);
  rec.lastFailureAt = Date.now();
  rec.consecutiveFailures = input.consecutiveFailures;
  if (input.responseMs != null) rec.lastResponseMs = input.responseMs;
  rec.lastError = input.error.slice(0, 300);
  rec.circuit = input.circuit;
  rec.nextEligibleAt = input.nextEligibleAt ?? null;
  await save(input.sourceId, rec);
}

export async function getSourceHealth(
  sourceId: string,
  meta: { tier: IngestTier; enabled: boolean }
): Promise<SourceHealthStatus> {
  const rec = await load(sourceId);
  return {
    sourceId,
    tier: meta.tier,
    enabled: meta.enabled,
    circuit: rec.circuit,
    lastSuccessAt: rec.lastSuccessAt ? new Date(rec.lastSuccessAt).toISOString() : null,
    lastFailureAt: rec.lastFailureAt ? new Date(rec.lastFailureAt).toISOString() : null,
    consecutiveFailures: rec.consecutiveFailures,
    lastResponseMs: rec.lastResponseMs,
    lastItemsReceived: rec.lastItemsReceived,
    lastError: rec.lastError,
    nextEligibleAt: rec.nextEligibleAt
      ? new Date(rec.nextEligibleAt).toISOString()
      : null,
  };
}

export function __resetHealthForTests(): void {
  memory.clear();
}
