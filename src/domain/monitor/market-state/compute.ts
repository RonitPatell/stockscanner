import { flagged, ok, unavailable, type MetricField } from "./field.ts";
import type { QuoteTick, SecondBar, TradeTick } from "./ring-buffer.ts";
import {
  getSessionContext,
  sessionVolumeFactor,
  type SessionSegment,
} from "./session.ts";
import type {
  QuoteMetrics,
  SessionMetrics,
  SymbolReference,
  WindowMetrics,
} from "./types.ts";
import { WINDOW_MS, type WindowKey } from "./version.ts";

export interface WindowAccelPrev {
  priceVelocity: number | null;
  tradesPerSecond: number | null;
  atMs: number | null;
}

function emptyWindow(window: WindowKey, windowMs: number): WindowMetrics {
  const u = <T,>(note: string): MetricField<T> => unavailable(note);
  return {
    window,
    windowMs,
    lastPrice: u("no_trades"),
    priceReturn: u("no_trades"),
    priceVelocity: u("no_trades"),
    priceAcceleration: u("no_trades"),
    tradeCount: ok(0),
    tradesPerSecond: ok(0),
    tradeRateAcceleration: u("insufficient_history"),
    shareVolumeVelocity: ok(0),
    dollarVolumeVelocity: ok(0),
    buySellImbalance: u("no_reliable_side"),
    high: u("no_trades"),
    low: u("no_trades"),
    realizedVolatility: u("insufficient_prints"),
  };
}

function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  const mean = sum / xs.length;
  let v = 0;
  for (const x of xs) {
    const d = x - mean;
    v += d * d;
  }
  return Math.sqrt(v / (xs.length - 1));
}

/** Aggregate trade ticks in [now-windowMs, now]. */
export function computeWindowFromTrades(
  window: WindowKey,
  windowMs: number,
  trades: TradeTick[],
  nowMs: number,
  prev: WindowAccelPrev
): WindowMetrics {
  const cutoff = nowMs - windowMs;
  const inWin = trades.filter((t) => t.t >= cutoff && t.t <= nowMs);
  if (inWin.length === 0) return emptyWindow(window, windowMs);

  let high = -Infinity;
  let low = Infinity;
  let vol = 0;
  let dollar = 0;
  let buy = 0;
  let sell = 0;
  let reliableSideVol = 0;
  let firstEligible: TradeTick | null = null;
  let lastEligible: TradeTick | null = null;
  const logRets: number[] = [];
  let prevPx: number | null = null;

  for (const t of inWin) {
    if (t.eligibleVol) {
      vol += t.size;
      dollar += t.dollar;
    }
    if (t.eligibleLast) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
      if (!firstEligible) firstEligible = t;
      lastEligible = t;
      if (prevPx != null && prevPx > 0 && t.price > 0) {
        logRets.push(Math.log(t.price / prevPx));
      }
      prevPx = t.price;
    }
    if (t.side === 1) {
      buy += t.size;
      reliableSideVol += t.size;
    } else if (t.side === 2) {
      sell += t.size;
      reliableSideVol += t.size;
    }
  }

  const tradeCount = inWin.length;
  const elapsedSec = Math.max(0.001, windowMs / 1000);
  const tps = tradeCount / elapsedSec;
  const shareVel = vol / elapsedSec;
  const dollarVel = dollar / elapsedSec;

  const m = emptyWindow(window, windowMs);
  m.tradeCount = ok(tradeCount);
  m.tradesPerSecond = ok(tps);
  m.shareVolumeVelocity = ok(shareVel);
  m.dollarVolumeVelocity = ok(dollarVel);

  if (lastEligible) {
    m.lastPrice = ok(lastEligible.price);
    m.high = Number.isFinite(high) ? ok(high) : unavailable("no_eligible_last");
    m.low = Number.isFinite(low) ? ok(low) : unavailable("no_eligible_last");
  }

  if (firstEligible && lastEligible && firstEligible.price > 0) {
    const ret = (lastEligible.price - firstEligible.price) / firstEligible.price;
    m.priceReturn = ok(ret);
    const dtSec = Math.max(
      0.001,
      (lastEligible.t - firstEligible.t) / 1000
    );
    const vel = (lastEligible.price - firstEligible.price) / dtSec;
    m.priceVelocity = ok(vel);
    if (prev.priceVelocity != null && prev.atMs != null) {
      const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
      m.priceAcceleration = ok((vel - prev.priceVelocity) / adt);
    } else {
      m.priceAcceleration = unavailable("insufficient_history");
    }
  }

  if (prev.tradesPerSecond != null && prev.atMs != null) {
    const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
    m.tradeRateAcceleration = ok((tps - prev.tradesPerSecond) / adt);
  }

  if (reliableSideVol > 0 && buy + sell > 0) {
    m.buySellImbalance = ok((buy - sell) / (buy + sell));
  } else {
    m.buySellImbalance = unavailable("no_reliable_side");
  }

  const rv = stdev(logRets);
  m.realizedVolatility =
    rv != null ? ok(rv) : unavailable("insufficient_prints");

  return m;
}

export function computeWindowFromBars(
  window: WindowKey,
  windowMs: number,
  bars: SecondBar[],
  nowMs: number,
  prev: WindowAccelPrev
): WindowMetrics {
  const cutoffSec = Math.floor((nowMs - windowMs) / 1000);
  const inWin = bars.filter((b) => b.sec >= cutoffSec);
  if (inWin.length === 0) return emptyWindow(window, windowMs);

  let high = -Infinity;
  let low = Infinity;
  let vol = 0;
  let dollar = 0;
  let trades = 0;
  let buy = 0;
  let sell = 0;
  const logRets: number[] = [];
  let prevClose: number | null = null;

  for (const b of inWin) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
    vol += b.volume;
    dollar += b.dollar;
    trades += b.trades;
    buy += b.buyVol;
    sell += b.sellVol;
    if (prevClose != null && prevClose > 0 && b.close > 0) {
      logRets.push(Math.log(b.close / prevClose));
    }
    prevClose = b.close;
  }

  const first = inWin[0]!;
  const last = inWin[inWin.length - 1]!;
  const elapsedSec = Math.max(0.001, windowMs / 1000);
  const tps = trades / elapsedSec;
  const m = emptyWindow(window, windowMs);
  m.tradeCount = ok(trades);
  m.tradesPerSecond = ok(tps);
  m.shareVolumeVelocity = ok(vol / elapsedSec);
  m.dollarVolumeVelocity = ok(dollar / elapsedSec);
  m.lastPrice = ok(last.close);
  m.high = ok(high);
  m.low = ok(low);

  if (first.open > 0) {
    const ret = (last.close - first.open) / first.open;
    m.priceReturn = ok(ret);
    const vel = (last.close - first.open) / elapsedSec;
    m.priceVelocity = ok(vel);
    if (prev.priceVelocity != null && prev.atMs != null) {
      const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
      m.priceAcceleration = ok((vel - prev.priceVelocity) / adt);
    } else {
      m.priceAcceleration = unavailable("insufficient_history");
    }
  }

  if (prev.tradesPerSecond != null && prev.atMs != null) {
    const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
    m.tradeRateAcceleration = ok((tps - prev.tradesPerSecond) / adt);
  }

  if (buy + sell > 0) {
    m.buySellImbalance = ok((buy - sell) / (buy + sell));
  } else {
    m.buySellImbalance = unavailable("no_reliable_side");
  }

  const rv = stdev(logRets);
  m.realizedVolatility =
    rv != null ? ok(rv) : unavailable("insufficient_prints");

  return m;
}

export function computeSessionWindow(
  session: {
    openPrice: number | null;
    lastPrice: number | null;
    high: number | null;
    low: number | null;
    volume: number;
    dollar: number;
    trades: number;
    buyVol: number;
    sellVol: number;
    sessionStartMs: number | null;
  },
  nowMs: number,
  prev: WindowAccelPrev
): WindowMetrics {
  const windowMs =
    session.sessionStartMs != null
      ? Math.max(1, nowMs - session.sessionStartMs)
      : 0;
  const m = emptyWindow("session", windowMs);
  if (session.lastPrice == null) return m;

  m.lastPrice = ok(session.lastPrice);
  m.tradeCount = ok(session.trades);
  if (session.high != null) m.high = ok(session.high);
  if (session.low != null) m.low = ok(session.low);

  const elapsedSec = Math.max(0.001, windowMs / 1000);
  const tps = session.trades / elapsedSec;
  m.tradesPerSecond = ok(tps);
  m.shareVolumeVelocity = ok(session.volume / elapsedSec);
  m.dollarVolumeVelocity = ok(session.dollar / elapsedSec);

  if (session.openPrice != null && session.openPrice > 0) {
    m.priceReturn = ok(
      (session.lastPrice - session.openPrice) / session.openPrice
    );
    const vel = (session.lastPrice - session.openPrice) / elapsedSec;
    m.priceVelocity = ok(vel);
    if (prev.priceVelocity != null && prev.atMs != null) {
      const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
      m.priceAcceleration = ok((vel - prev.priceVelocity) / adt);
    } else {
      m.priceAcceleration = unavailable("insufficient_history");
    }
  }

  if (prev.tradesPerSecond != null && prev.atMs != null) {
    const adt = Math.max(0.001, (nowMs - prev.atMs) / 1000);
    m.tradeRateAcceleration = ok((tps - prev.tradesPerSecond) / adt);
  }

  if (session.buyVol + session.sellVol > 0) {
    m.buySellImbalance = ok(
      (session.buyVol - session.sellVol) /
        (session.buyVol + session.sellVol)
    );
  } else {
    m.buySellImbalance = unavailable("no_reliable_side");
  }

  m.realizedVolatility = unavailable("use_window_bars");
  return m;
}

const QUOTE_STALE_MS = 5_000;

export function computeQuoteMetrics(
  quotes: QuoteTick[],
  nowMs: number,
  prevSpread: number | null
): QuoteMetrics {
  const flags: string[] = [];
  if (quotes.length === 0) {
    return {
      quoteUpdateRate: unavailable("no_quotes"),
      spreadDollars: unavailable("no_quotes"),
      spreadBps: unavailable("no_quotes"),
      spreadChange: unavailable("no_quotes"),
      bidSize: unavailable("no_quotes"),
      askSize: unavailable("no_quotes"),
      quoteFlags: ["no_quotes"],
    };
  }

  const latest = quotes[quotes.length - 1]!;
  const age = nowMs - latest.t;
  const rateCutoff = nowMs - 30_000;
  const recent = quotes.filter((q) => q.t >= rateCutoff);
  const rate = recent.length / 30;

  let spreadDollars: MetricField<number>;
  let spreadBps: MetricField<number>;
  let bidSize: MetricField<number>;
  let askSize: MetricField<number>;

  if (latest.crossed) {
    flags.push("crossed");
    const raw = latest.ask - latest.bid;
    spreadDollars = flagged(raw, "crossed_quote");
    const mid = (latest.bid + latest.ask) / 2;
    spreadBps =
      mid > 0
        ? flagged((raw / mid) * 10_000, "crossed_quote")
        : unavailable("invalid_mid");
    bidSize = flagged(latest.bidSize, "crossed_quote");
    askSize = flagged(latest.askSize, "crossed_quote");
  } else if (latest.stale || age > QUOTE_STALE_MS) {
    flags.push("stale");
    const raw = latest.ask - latest.bid;
    spreadDollars = staleOrFlag(raw, "stale_quote");
    const mid = (latest.bid + latest.ask) / 2;
    spreadBps =
      mid > 0
        ? staleOrFlag((raw / mid) * 10_000, "stale_quote")
        : unavailable("invalid_mid");
    bidSize = staleOrFlag(latest.bidSize, "stale_quote");
    askSize = staleOrFlag(latest.askSize, "stale_quote");
  } else {
    const raw = latest.ask - latest.bid;
    if (raw < 0) {
      flags.push("negative_spread");
      spreadDollars = flagged(raw, "negative_spread");
      spreadBps = unavailable("negative_spread");
    } else {
      spreadDollars = ok(raw);
      const mid = (latest.bid + latest.ask) / 2;
      spreadBps =
        mid > 0 ? ok((raw / mid) * 10_000) : unavailable("invalid_mid");
    }
    bidSize = ok(latest.bidSize);
    askSize = ok(latest.askSize);
  }

  let spreadChange: MetricField<number>;
  if (
    spreadDollars.availability === "ok" &&
    spreadDollars.value != null &&
    prevSpread != null
  ) {
    spreadChange = ok(spreadDollars.value - prevSpread);
  } else if (spreadDollars.value != null && prevSpread != null) {
    spreadChange = flagged(
      spreadDollars.value - prevSpread,
      "quote_quality_degraded"
    );
  } else {
    spreadChange = unavailable("no_prior_spread");
  }

  return {
    quoteUpdateRate: ok(rate),
    spreadDollars,
    spreadBps,
    spreadChange,
    bidSize,
    askSize,
    quoteFlags: flags,
  };
}

function staleOrFlag(value: number, note: string): MetricField<number> {
  return flagged(value, note);
}

export function computeSessionMetrics(
  nowMs: number,
  lastPrice: number | null,
  session: {
    hod: number | null;
    lod: number | null;
    vwapNumerator: number;
    volume: number;
  },
  ref: SymbolReference | null,
  segment: SessionSegment,
  sessionDate: string,
  etMinutes: number
): SessionMetrics {
  const ctx = { segment, sessionDate };
  const hod =
    session.hod != null ? ok(session.hod) : unavailable<number>("no_session_high");
  const lod =
    session.lod != null ? ok(session.lod) : unavailable<number>("no_session_low");

  let distanceFromHod: MetricField<number> = unavailable("missing_price_or_hod");
  let distanceFromLod: MetricField<number> = unavailable("missing_price_or_lod");
  if (lastPrice != null && session.hod != null && session.hod > 0) {
    distanceFromHod = ok((lastPrice - session.hod) / session.hod);
  }
  if (lastPrice != null && session.lod != null && session.lod > 0) {
    distanceFromLod = ok((lastPrice - session.lod) / session.lod);
  }

  let vwap: MetricField<number> = unavailable("no_volume");
  let distanceFromVwap: MetricField<number> = unavailable("no_vwap");
  if (session.volume > 0) {
    const v = session.vwapNumerator / session.volume;
    vwap = ok(v);
    if (lastPrice != null && v > 0) {
      distanceFromVwap = ok((lastPrice - v) / v);
    }
  }

  let relativeVolume: MetricField<number> = unavailable("no_adv");
  const adv = ref?.avgDailyVolume;
  if (adv != null && adv > 0) {
    const factor = sessionVolumeFactor(segment, etMinutes);
    const expected = adv * factor;
    if (expected > 0) {
      relativeVolume = ok(session.volume / expected);
    }
  }

  let turnoverVsFloat: MetricField<number> = unavailable("no_float");
  const conf = ref?.floatConfidence ?? "unknown";
  const fl = ref?.floatShares;
  if (fl != null && fl > 0 && (conf === "high" || conf === "medium")) {
    turnoverVsFloat = ok(session.volume / fl);
  } else if (fl != null && fl > 0) {
    turnoverVsFloat = unavailable(`float_confidence_${conf}`);
  }

  void ctx;
  return {
    segment,
    sessionDate,
    hod,
    lod,
    distanceFromHod,
    distanceFromLod,
    vwap,
    distanceFromVwap,
    relativeVolume,
    turnoverVsFloat,
  };
}

export function sessionMeta(nowMs: number): {
  segment: SessionSegment;
  sessionDate: string;
  etMinutes: number;
} {
  const c = getSessionContext(nowMs);
  return {
    segment: c.segment,
    sessionDate: c.sessionDate,
    etMinutes: c.etMinutes,
  };
}

export { WINDOW_MS };
