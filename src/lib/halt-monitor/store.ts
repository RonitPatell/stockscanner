import { getRedis } from "../redis.ts";
import type { HaltRecord, HaltTransitionRecord } from "./types.ts";

const ACTIVE_KEY = "halt:active:v1";
const TRANS_KEY = "halt:transitions:v1";
const CLAIM_PREFIX = "halt:alert:claim:";
const memoryActive = new Map<string, HaltRecord>();
const memoryTransitions: HaltTransitionRecord[] = [];
const memoryClaims = new Set<string>();

export function __resetHaltStoreForTests(): void {
  memoryActive.clear();
  memoryTransitions.length = 0;
  memoryClaims.clear();
}

export async function getActiveHalt(symbol: string): Promise<HaltRecord | null> {
  const sym = symbol.toUpperCase();
  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, HaltRecord>>(ACTIVE_KEY);
      if (all?.[sym]) return all[sym]!;
    } catch {
      /* memory */
    }
  }
  return memoryActive.get(sym) ?? null;
}

export async function upsertActiveHalt(record: HaltRecord): Promise<void> {
  memoryActive.set(record.symbol, record);
  const redis = getRedis();
  if (redis) {
    try {
      const all =
        (await redis.get<Record<string, HaltRecord>>(ACTIVE_KEY)) ?? {};
      if (record.lifecycle === "resumed" || record.lifecycle === "trading") {
        // Keep briefly for session count, then could expire — keep until session end
        all[record.symbol] = record;
      } else {
        all[record.symbol] = record;
      }
      await redis.set(ACTIVE_KEY, all, { ex: 36 * 3600 });
    } catch {
      /* ignore */
    }
  }
}

export async function listActiveHalts(): Promise<HaltRecord[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, HaltRecord>>(ACTIVE_KEY);
      if (all) return Object.values(all);
    } catch {
      /* memory */
    }
  }
  return [...memoryActive.values()];
}

export async function appendTransition(
  t: HaltTransitionRecord
): Promise<void> {
  memoryTransitions.unshift(t);
  if (memoryTransitions.length > 2_000) memoryTransitions.length = 2_000;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.lpush(TRANS_KEY, JSON.stringify(t));
      await redis.ltrim(TRANS_KEY, 0, 1_999);
      await redis.expire(TRANS_KEY, 14 * 24 * 3600);
    } catch {
      /* ignore */
    }
  }
}

export async function listTransitions(
  symbol?: string,
  limit = 100
): Promise<HaltTransitionRecord[]> {
  const redis = getRedis();
  let rows: HaltTransitionRecord[] = memoryTransitions;
  if (redis) {
    try {
      const raw = await redis.lrange(TRANS_KEY, 0, 499);
      rows = (raw ?? [])
        .map((r) => {
          try {
            return typeof r === "string"
              ? (JSON.parse(r) as HaltTransitionRecord)
              : (r as HaltTransitionRecord);
          } catch {
            return null;
          }
        })
        .filter((x): x is HaltTransitionRecord => !!x);
    } catch {
      /* memory */
    }
  }
  const filtered = symbol
    ? rows.filter((t) => t.symbol === symbol.toUpperCase())
    : rows;
  return filtered.slice(0, limit);
}

/** Suppress duplicate halt alerts (same symbol + transition + halt window). */
export async function claimHaltAlert(
  symbol: string,
  alert: string,
  haltId: string,
  ttlMs = 10 * 60_000
): Promise<boolean> {
  const key = `${CLAIM_PREFIX}${symbol}:${alert}:${haltId}`;
  const redis = getRedis();
  if (redis) {
    try {
      const ok = await redis.set(key, "1", { nx: true, px: ttlMs });
      return Boolean(ok);
    } catch {
      /* memory */
    }
  }
  if (memoryClaims.has(key)) return false;
  memoryClaims.add(key);
  return true;
}

export async function sessionHaltCount(
  symbol: string,
  sessionDateEt: string
): Promise<number> {
  const transitions = await listTransitions(symbol, 500);
  return transitions.filter(
    (t) =>
      (t.alertTransition === "HALTED" || t.alertTransition === "REHALTED") &&
      sessionDateFromIso(t.at) === sessionDateEt
  ).length;
}

function sessionDateFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
