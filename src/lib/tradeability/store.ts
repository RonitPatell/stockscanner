import { getRedis } from "../redis.ts";
import type { TradeabilityClass, TradeabilityResult } from "./types.ts";

const LAST_KEY = "tradeability:last:v1";
const TRANS_KEY = "tradeability:transitions:v1";

type TransitionRow = {
  symbol: string;
  fromClass: TradeabilityClass | null;
  toClass: TradeabilityClass;
  at: string;
  explanation: string;
  engineVersion: string;
};

const memoryLast = new Map<string, TradeabilityResult>();
const memoryTrans: TransitionRow[] = [];

export function __resetTradeabilityStoreForTests(): void {
  memoryLast.clear();
  memoryTrans.length = 0;
}

export async function getLastTradeability(
  symbol: string
): Promise<TradeabilityResult | null> {
  const sym = symbol.toUpperCase();
  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, TradeabilityResult>>(LAST_KEY);
      if (all?.[sym]) return all[sym]!;
    } catch {
      /* memory */
    }
  }
  return memoryLast.get(sym) ?? null;
}

export async function saveTradeabilityResult(
  result: TradeabilityResult
): Promise<{ transitionRecorded: boolean }> {
  const prior = memoryLast.get(result.symbol) ?? null;
  memoryLast.set(result.symbol, result);

  const redis = getRedis();
  if (redis) {
    try {
      const all =
        (await redis.get<Record<string, TradeabilityResult>>(LAST_KEY)) ?? {};
      all[result.symbol] = result;
      await redis.set(LAST_KEY, all, { ex: 36 * 3600 });
    } catch {
      /* ignore */
    }
  }

  let transitionRecorded = false;
  if (
    result.previousClass &&
    result.previousClass !== result.class &&
    !result.flappedSuppressed
  ) {
    const row: TransitionRow = {
      symbol: result.symbol,
      fromClass: result.previousClass,
      toClass: result.class,
      at: result.computedAt,
      explanation: result.explanation.slice(0, 500),
      engineVersion: result.engineVersion,
    };
    memoryTrans.unshift(row);
    if (memoryTrans.length > 2_000) memoryTrans.length = 2_000;
    transitionRecorded = true;
    if (redis) {
      try {
        await redis.lpush(TRANS_KEY, JSON.stringify(row));
        await redis.ltrim(TRANS_KEY, 0, 1_999);
        await redis.expire(TRANS_KEY, 14 * 24 * 3600);
      } catch {
        /* ignore */
      }
    }
  } else if (!result.previousClass && prior && prior.class !== result.class) {
    // first save after prior in memory
  }

  return { transitionRecorded };
}

export async function listTradeabilityTransitions(
  symbol?: string,
  limit = 100
): Promise<TransitionRow[]> {
  const redis = getRedis();
  let rows = memoryTrans;
  if (redis) {
    try {
      const raw = await redis.lrange(TRANS_KEY, 0, 499);
      rows = (raw ?? [])
        .map((r) => {
          try {
            return typeof r === "string"
              ? (JSON.parse(r) as TransitionRow)
              : (r as TransitionRow);
          } catch {
            return null;
          }
        })
        .filter((x): x is TransitionRow => !!x);
    } catch {
      /* memory */
    }
  }
  const filtered = symbol
    ? rows.filter((r) => r.symbol === symbol.toUpperCase())
    : rows;
  return filtered.slice(0, limit);
}
