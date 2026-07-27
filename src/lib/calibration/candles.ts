import type {
  OutcomeHorizon,
  PriceDataSource,
  PriceSnapshot,
  PriceTimestampQuality,
} from "./types.ts";
import { classifyPriceJump, emptySnapshot } from "./buckets.ts";

export interface CandleBar {
  /** Unix seconds (candle open) */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface CandleSet {
  bars: CandleBar[];
  /** Optional halt windows [startSec, endSec] */
  haltWindows?: Array<[number, number]>;
}

/**
 * Resolve price at a target unix second from 1m candles.
 * NEVER silently uses a later candle — substitutions are always labelled.
 */
export function priceAtTarget(
  candles: CandleSet,
  targetSec: number,
  opts: {
    horizon: OutcomeHorizon;
    source?: PriceDataSource;
    /** Max seconds after target to accept a substitute candle */
    maxSubstituteLagSec?: number;
    entryPrice?: number | null;
  }
): PriceSnapshot {
  const targetAt = new Date(targetSec * 1000).toISOString();
  const source = opts.source ?? "finnhub_1m";
  const maxLag = opts.maxSubstituteLagSec ?? 180;

  if (!candles.bars.length) {
    return emptySnapshot(opts.horizon, targetAt, "no_candles");
  }

  // Halt coverage
  for (const [hs, he] of candles.haltWindows ?? []) {
    if (targetSec >= hs && targetSec < he) {
      return {
        horizon: opts.horizon,
        price: null,
        observedAt: null,
        targetAt,
        source,
        quality: "HALTED",
        substituted: false,
        substituteLagSec: null,
        volume: null,
        spreadPct: null,
        note: `halt_${hs}_${he}`,
      };
    }
  }

  // Prefer candle whose open is within ±30s of target (exact-ish)
  let exactIdx = -1;
  for (let i = 0; i < candles.bars.length; i++) {
    const b = candles.bars[i]!;
    if (Math.abs(b.t - targetSec) <= 30) {
      exactIdx = i;
      break;
    }
  }

  if (exactIdx >= 0) {
    const b = candles.bars[exactIdx]!;
    let quality: PriceTimestampQuality = "CANDLE_CLOSE";
    if (opts.entryPrice != null && opts.entryPrice > 0) {
      const jump = classifyPriceJump(opts.entryPrice, b.c, Math.abs(b.t - targetSec));
      if (jump) quality = jump;
    }
    return {
      horizon: opts.horizon,
      price: b.c,
      observedAt: new Date(b.t * 1000).toISOString(),
      targetAt,
      source,
      quality,
      substituted: false,
      substituteLagSec: null,
      volume: b.v ?? null,
      spreadPct: null,
    };
  }

  // Next candle at or after target
  let next: CandleBar | null = null;
  for (const b of candles.bars) {
    if (b.t >= targetSec - 5) {
      next = b;
      break;
    }
  }

  if (!next) {
    return emptySnapshot(opts.horizon, targetAt, "no_candle_at_or_after_target");
  }

  const lag = next.t - targetSec;
  if (lag > maxLag) {
    return {
      ...emptySnapshot(opts.horizon, targetAt, "substitute_exceeds_max_lag"),
      quality: "MISSING",
      note: `next_candle_lag_${lag}s_exceeds_${maxLag}s`,
    };
  }

  if (lag < 0) {
    // Slightly early candle — treat as approximate exact
    return {
      horizon: opts.horizon,
      price: next.c,
      observedAt: new Date(next.t * 1000).toISOString(),
      targetAt,
      source,
      quality: "CANDLE_CLOSE",
      substituted: false,
      substituteLagSec: null,
      volume: next.v ?? null,
      spreadPct: null,
    };
  }

  let quality: PriceTimestampQuality = "SUBSTITUTED_NEXT";
  if (opts.entryPrice != null && opts.entryPrice > 0) {
    const jump = classifyPriceJump(opts.entryPrice, next.c, lag);
    if (jump) quality = jump;
  }

  return {
    horizon: opts.horizon,
    price: next.c,
    observedAt: new Date(next.t * 1000).toISOString(),
    targetAt,
    source,
    quality,
    substituted: true,
    substituteLagSec: lag,
    volume: next.v ?? null,
    spreadPct: null,
    note: `substituted_next_candle_+${lag}s`,
  };
}

/**
 * MFE / MAE from entry over bars in [fromSec, toSec].
 * MFE = max favourable (up) excursion %; MAE = max adverse (down) excursion % (negative).
 */
export function computeExcursions(
  candles: CandleSet,
  entryPrice: number,
  fromSec: number,
  toSec: number
): { mfePct: number | null; maePct: number | null } {
  if (!(entryPrice > 0) || !candles.bars.length) {
    return { mfePct: null, maePct: null };
  }
  let mfe = 0;
  let mae = 0;
  let any = false;
  for (const b of candles.bars) {
    if (b.t < fromSec - 30 || b.t > toSec + 30) continue;
    any = true;
    const hi = ((b.h - entryPrice) / entryPrice) * 100;
    const lo = ((b.l - entryPrice) / entryPrice) * 100;
    if (hi > mfe) mfe = hi;
    if (lo < mae) mae = lo;
  }
  if (!any) return { mfePct: null, maePct: null };
  return {
    mfePct: Math.round(mfe * 100) / 100,
    maePct: Math.round(mae * 100) / 100,
  };
}

export function rawReturnPct(entry: number | null, exit: number | null): number | null {
  if (entry == null || exit == null || !(entry > 0)) return null;
  return Math.round(((exit - entry) / entry) * 10000) / 100;
}

export function relativeReturnPct(
  assetReturn: number | null,
  benchReturn: number | null
): number | null {
  if (assetReturn == null || benchReturn == null) return null;
  return Math.round((assetReturn - benchReturn) * 100) / 100;
}

/** Mark quote as STALE if observed age exceeds threshold. */
export function qualityForQuoteAge(
  observedAtMs: number,
  nowMs: number,
  staleAfterSec = 90
): PriceTimestampQuality {
  const age = (nowMs - observedAtMs) / 1000;
  if (!Number.isFinite(age) || age < 0) return "INVALID";
  if (age > staleAfterSec) return "STALE";
  return "EXACT";
}

/** Next regular-session open (09:30 ET) after a given instant. */
export function nextRegularOpenEt(after: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

  // Walk forward hour-by-hour until we hit 09:30 ET on a weekday
  let cursor = new Date(after.getTime());
  for (let i = 0; i < 96; i++) {
    cursor = new Date(cursor.getTime() + 15 * 60_000);
    const parts = fmt.formatToParts(cursor);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (weekday === "Sat" || weekday === "Sun") continue;
    if (hour === 9 && minute === 30) return cursor;
    // Land on first bar at/after 09:30 same day if we're before open
    if (hour === 9 && minute > 30 && minute < 45) {
      // Approximate: return this cursor as near-open
      return cursor;
    }
  }
  return new Date(after.getTime() + 24 * 3600_000);
}

/** Same-day regular close 16:00 ET (or next session close if after). */
export function sessionCloseEt(around: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  let cursor = new Date(around.getTime() - 60_000);
  for (let i = 0; i < 120; i++) {
    cursor = new Date(cursor.getTime() + 15 * 60_000);
    const parts = fmt.formatToParts(cursor);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (weekday === "Sat" || weekday === "Sun") continue;
    if (hour === 16 && minute === 0) return cursor;
  }
  return new Date(around.getTime() + 8 * 3600_000);
}
