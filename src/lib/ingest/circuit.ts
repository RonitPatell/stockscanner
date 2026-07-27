import { getRedis } from "../redis.ts";
import { backoffWithJitterMs } from "./schedule.ts";
import type { CircuitConfig, CircuitState } from "./types.ts";

type CircuitRecord = {
  consecutiveFailures: number;
  openedAt: number | null;
  state: CircuitState;
  nextEligibleAt: number;
};

const memory = new Map<string, CircuitRecord>();

function key(provider: string): string {
  return `ingest:circuit:${provider}`;
}

function defaultRecord(): CircuitRecord {
  return {
    consecutiveFailures: 0,
    openedAt: null,
    state: "closed",
    nextEligibleAt: 0,
  };
}

async function load(provider: string): Promise<CircuitRecord> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<CircuitRecord>(key(provider));
      if (raw && typeof raw === "object") return { ...defaultRecord(), ...raw };
    } catch {
      /* memory */
    }
  }
  return memory.get(provider) ?? defaultRecord();
}

async function save(provider: string, rec: CircuitRecord): Promise<void> {
  memory.set(provider, rec);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key(provider), rec, { ex: 7 * 24 * 3600 });
    } catch {
      /* ignore */
    }
  }
}

export async function getCircuitState(
  provider: string,
  cfg: CircuitConfig,
  now = Date.now()
): Promise<{ state: CircuitState; allow: boolean; nextEligibleAt: number }> {
  const rec = await load(provider);
  if (rec.state === "open") {
    if (now >= rec.nextEligibleAt) {
      rec.state = "half_open";
      await save(provider, rec);
      return { state: "half_open", allow: true, nextEligibleAt: rec.nextEligibleAt };
    }
    return { state: "open", allow: false, nextEligibleAt: rec.nextEligibleAt };
  }
  if (rec.nextEligibleAt > now && rec.consecutiveFailures > 0) {
    // Backoff after failures even when circuit still closed
    return { state: rec.state, allow: false, nextEligibleAt: rec.nextEligibleAt };
  }
  return { state: rec.state, allow: true, nextEligibleAt: rec.nextEligibleAt };
}

export async function recordCircuitSuccess(provider: string): Promise<void> {
  await save(provider, defaultRecord());
}

export async function recordCircuitFailure(
  provider: string,
  cfg: CircuitConfig
): Promise<CircuitRecord> {
  const rec = await load(provider);
  rec.consecutiveFailures += 1;
  const delay = backoffWithJitterMs(rec.consecutiveFailures, {
    baseMs: 2_000,
    maxMs: cfg.coolDownMs,
  });
  rec.nextEligibleAt = Date.now() + delay;
  if (rec.consecutiveFailures >= cfg.failureThreshold) {
    rec.state = "open";
    rec.openedAt = Date.now();
    rec.nextEligibleAt = Date.now() + cfg.coolDownMs;
  }
  await save(provider, rec);
  return rec;
}

export function __resetCircuitsForTests(): void {
  memory.clear();
}
