/**
 * Per-strategy cooldown + daily alert caps (in-memory + Redis-ready keys).
 * Never stores phone numbers or watchlist contents.
 */

export interface CooldownState {
  lastFiredAtMs: number;
  dayKey: string;
  dayCount: number;
}

const memory = new Map<string, CooldownState>();

function dayKeyEt(nowMs = Date.now()): string {
  // Approximate ET calendar day for daily caps
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(nowMs));
}

export function cooldownKey(
  userId: string,
  strategyId: string,
  symbol: string
): string {
  return `strat_cd:${userId}:${strategyId}:${symbol.toUpperCase()}`;
}

export function dailyCapKey(userId: string, strategyId: string, day: string): string {
  return `strat_cap:${userId}:${strategyId}:${day}`;
}

export function checkStrategyCooldown(opts: {
  userId: string;
  strategyId: string;
  symbol: string;
  cooldownMinutes: number;
  dailyAlertCap: number | null;
  nowMs?: number;
}): { allowed: boolean; reason: string | null } {
  const now = opts.nowMs ?? Date.now();
  const key = cooldownKey(opts.userId, opts.strategyId, opts.symbol);
  const state = memory.get(key);
  const cooldownMs = Math.max(0, opts.cooldownMinutes) * 60_000;

  if (state && cooldownMs > 0 && now - state.lastFiredAtMs < cooldownMs) {
    const remainSec = Math.ceil((cooldownMs - (now - state.lastFiredAtMs)) / 1000);
    return {
      allowed: false,
      reason: `Per-rule cooldown active (~${remainSec}s remaining)`,
    };
  }

  if (opts.dailyAlertCap != null && opts.dailyAlertCap > 0) {
    const day = dayKeyEt(now);
    const capState = memory.get(
      dailyCapKey(opts.userId, opts.strategyId, day)
    );
    const count = capState?.dayCount ?? 0;

    if (count >= opts.dailyAlertCap) {
      return {
        allowed: false,
        reason: `Daily alert cap reached (${opts.dailyAlertCap})`,
      };
    }
  }

  return { allowed: true, reason: null };
}

export function recordStrategyFire(opts: {
  userId: string;
  strategyId: string;
  symbol: string;
  nowMs?: number;
}): void {
  const now = opts.nowMs ?? Date.now();
  const day = dayKeyEt(now);
  const key = cooldownKey(opts.userId, opts.strategyId, opts.symbol);
  const prev = memory.get(key);
  const sameDay = prev?.dayKey === day;
  memory.set(key, {
    lastFiredAtMs: now,
    dayKey: day,
    dayCount: sameDay ? (prev?.dayCount ?? 0) + 1 : 1,
  });

  const capKey = dailyCapKey(opts.userId, opts.strategyId, day);
  const capPrev = memory.get(capKey);
  memory.set(capKey, {
    lastFiredAtMs: now,
    dayKey: day,
    dayCount: (capPrev?.dayCount ?? 0) + 1,
  });
}

/** Test helper */
export function __resetStrategyCooldownForTests(): void {
  memory.clear();
}
