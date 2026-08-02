import type {
  NormalizedAggregate,
  NormalizedHaltEvent,
  NormalizedNbboQuote,
  NormalizedTrade,
} from "../market-data/types.ts";
import {
  computeQuoteMetrics,
  computeSessionMetrics,
  computeSessionWindow,
  computeWindowFromBars,
  computeWindowFromTrades,
  sessionMeta,
  type WindowAccelPrev,
} from "./compute.ts";
import { ok, unavailable } from "./field.ts";
import {
  RingBuffer,
  type QuoteTick,
  type SecondBar,
  type TradeTick,
} from "./ring-buffer.ts";
import {
  classifyTradeConditions,
  inferTradeSide,
} from "./trade-eligibility.ts";
import type {
  SymbolMarketState,
  SymbolReference,
  WindowMetrics,
} from "./types.ts";
import {
  MONITOR_MARKET_STATE_VERSION,
  WINDOW_KEYS,
  WINDOW_MS,
  type WindowKey,
} from "./version.ts";

const TRADE_CAP = 2048;
const QUOTE_CAP = 512;
const SECOND_BARS = 300; // 5 minutes
const SHORT_WINDOWS: WindowKey[] = ["w5s", "w15s", "w30s", "w1m"];
const BAR_WINDOWS: WindowKey[] = ["w3m", "w5m"];

export class SymbolState {
  readonly symbol: string;
  private readonly trades = new RingBuffer<TradeTick>(TRADE_CAP);
  private readonly quotes = new RingBuffer<QuoteTick>(QUOTE_CAP);
  private readonly bars: Array<SecondBar | undefined>;
  private barWrite = 0;
  private barCount = 0;

  private lastEligiblePrice: number | null = null;
  private lastEventMs = 0;
  private lastTradeMs = 0;
  private lastQuoteMs = 0;
  private lastBid: number | null = null;
  private lastAsk: number | null = null;
  private prevSpread: number | null = null;
  private okSpreadForChange: number | null = null;

  private sessionDate: string | null = null;
  private sessionStartMs: number | null = null;
  private sessionOpen: number | null = null;
  private sessionHod: number | null = null;
  private sessionLod: number | null = null;
  private sessionVolume = 0;
  private sessionDollar = 0;
  private sessionTrades = 0;
  private sessionBuy = 0;
  private sessionSell = 0;
  private vwapNumerator = 0;

  private halt = {
    halted: false,
    reason: null as string | null,
    sinceMs: null as number | null,
  };

  private ref: SymbolReference | null = null;
  private accel: Record<WindowKey, WindowAccelPrev>;
  lastTouchMs = 0;

  constructor(symbol: string) {
    this.symbol = symbol;
    this.bars = new Array(SECOND_BARS);
    this.accel = {} as Record<WindowKey, WindowAccelPrev>;
    for (const k of WINDOW_KEYS) {
      this.accel[k] = {
        priceVelocity: null,
        tradesPerSecond: null,
        atMs: null,
      };
    }
  }

  setReference(ref: SymbolReference): void {
    this.ref = ref;
  }

  ingestTrade(ev: NormalizedTrade, nowMs: number): void {
    const tMs = Date.parse(ev.sipTimestamp || ev.participantTimestamp);
    const eventMs = Number.isFinite(tMs) ? tMs : nowMs;
    this.lastTouchMs = nowMs;
    this.lastEventMs = eventMs;
    this.lastTradeMs = eventMs;

    this.rollSessionIfNeeded(eventMs);

    const elig = classifyTradeConditions(ev.conditions);
    const quoteAge =
      this.lastQuoteMs > 0 ? eventMs - this.lastQuoteMs : null;
    const sideInf = inferTradeSide({
      price: ev.price,
      bid: this.lastBid,
      ask: this.lastAsk,
      quoteAgeMs: quoteAge,
    });
    const side: 0 | 1 | 2 =
      sideInf.reliable && sideInf.side === "buy"
        ? 1
        : sideInf.reliable && sideInf.side === "sell"
          ? 2
          : 0;

    const tick: TradeTick = {
      t: eventMs,
      price: ev.price,
      size: ev.size,
      dollar: ev.price * ev.size,
      side,
      eligibleLast: elig.eligibleForLast,
      eligibleVol: elig.eligibleForVolume,
    };
    this.trades.push(tick);
    this.applyToBar(tick);
    this.applyToSession(tick);
  }

  ingestQuote(ev: NormalizedNbboQuote, nowMs: number): void {
    const tMs = Date.parse(ev.sipTimestamp);
    const eventMs = Number.isFinite(tMs) ? tMs : nowMs;
    this.lastTouchMs = nowMs;
    this.lastEventMs = eventMs;
    this.lastQuoteMs = eventMs;
    this.rollSessionIfNeeded(eventMs);

    const crossed = ev.askPrice < ev.bidPrice;
    const staleQ =
      ev.quoteQuality === "stale" || ev.quoteQuality === "indicative";
    const tick: QuoteTick = {
      t: eventMs,
      bid: ev.bidPrice,
      ask: ev.askPrice,
      bidSize: ev.bidSize,
      askSize: ev.askSize,
      crossed,
      stale: staleQ,
    };
    if (!crossed && !staleQ && ev.askPrice >= ev.bidPrice) {
      if (this.okSpreadForChange != null) {
        this.prevSpread = this.okSpreadForChange;
      }
      this.okSpreadForChange = ev.askPrice - ev.bidPrice;
    }
    this.quotes.push(tick);
    this.lastBid = ev.bidPrice;
    this.lastAsk = ev.askPrice;
  }

  ingestAggregate(ev: NormalizedAggregate, nowMs: number): void {
    const start = Date.parse(ev.windowStart);
    const eventMs = Number.isFinite(start) ? start : nowMs;
    this.lastTouchMs = nowMs;
    this.lastEventMs = eventMs;
    this.rollSessionIfNeeded(eventMs);

    // Synthesize a compact bar update when trade tape is sparse.
    const sec = Math.floor(eventMs / 1000);
    const bar: SecondBar = {
      sec,
      open: ev.open,
      high: ev.high,
      low: ev.low,
      close: ev.close,
      volume: ev.volume,
      dollar: (ev.vwap ?? (ev.open + ev.close) / 2) * ev.volume,
      trades: ev.tradeCount ?? 0,
      buyVol: 0,
      sellVol: 0,
    };
    this.upsertBar(bar);

    if (ev.close > 0) {
      this.lastEligiblePrice = ev.close;
      if (this.sessionOpen == null) this.sessionOpen = ev.open;
      if (this.sessionHod == null || ev.high > this.sessionHod) {
        this.sessionHod = ev.high;
      }
      if (this.sessionLod == null || ev.low < this.sessionLod) {
        this.sessionLod = ev.low;
      }
    }
  }

  ingestHalt(ev: NormalizedHaltEvent, nowMs: number): void {
    const tMs = Date.parse(ev.eventAt);
    const eventMs = Number.isFinite(tMs) ? tMs : nowMs;
    this.lastTouchMs = nowMs;
    this.lastEventMs = eventMs;
    if (ev.lifecycle === "halted" || ev.lifecycle === "news_disseminated") {
      this.halt = {
        halted: true,
        reason: ev.haltCode || ev.lifecycle,
        sinceMs: eventMs,
      };
    } else if (ev.lifecycle === "resumed") {
      this.halt = { halted: false, reason: null, sinceMs: null };
    } else if (ev.lifecycle === "resumption_quote_scheduled") {
      this.halt = {
        halted: true,
        reason: ev.haltCode || ev.lifecycle,
        sinceMs: this.halt.sinceMs ?? eventMs,
      };
    }
  }

  snapshot(nowMs: number): SymbolMarketState {
    const tradeArr = this.trades.toArray();
    const quoteArr = this.quotes.toArray();
    const bars = this.barsToArray();
    const meta = sessionMeta(nowMs);

    const windows = {} as Record<WindowKey, WindowMetrics>;
    for (const k of SHORT_WINDOWS) {
      const m = computeWindowFromTrades(
        k,
        WINDOW_MS[k],
        tradeArr,
        nowMs,
        this.accel[k]
      );
      this.updateAccel(k, m, nowMs);
      windows[k] = m;
    }
    for (const k of BAR_WINDOWS) {
      const m = computeWindowFromBars(
        k,
        WINDOW_MS[k],
        bars,
        nowMs,
        this.accel[k]
      );
      this.updateAccel(k, m, nowMs);
      windows[k] = m;
    }
    const sessWin = computeSessionWindow(
      {
        openPrice: this.sessionOpen,
        lastPrice: this.lastEligiblePrice,
        high: this.sessionHod,
        low: this.sessionLod,
        volume: this.sessionVolume,
        dollar: this.sessionDollar,
        trades: this.sessionTrades,
        buyVol: this.sessionBuy,
        sellVol: this.sessionSell,
        sessionStartMs: this.sessionStartMs,
      },
      nowMs,
      this.accel.session
    );
    this.updateAccel("session", sessWin, nowMs);
    windows.session = sessWin;

    const quote = computeQuoteMetrics(quoteArr, nowMs, this.prevSpread);
    const session = computeSessionMetrics(
      nowMs,
      this.lastEligiblePrice,
      {
        hod: this.sessionHod,
        lod: this.sessionLod,
        vwapNumerator: this.vwapNumerator,
        volume: this.sessionVolume,
      },
      this.ref,
      meta.segment,
      meta.sessionDate,
      meta.etMinutes
    );

    const freshnessMs =
      this.lastEventMs > 0 ? Math.max(0, nowMs - this.lastEventMs) : null;

    return {
      symbol: this.symbol,
      calcVersion: MONITOR_MARKET_STATE_VERSION,
      asOfMs: nowMs,
      lastPrice:
        this.lastEligiblePrice != null
          ? ok(this.lastEligiblePrice)
          : unavailable("no_eligible_last"),
      dataFreshnessMs:
        freshnessMs != null
          ? ok(freshnessMs)
          : unavailable("no_events"),
      haltState: ok({ ...this.halt }),
      windows,
      quote,
      session,
    };
  }

  private updateAccel(k: WindowKey, m: WindowMetrics, nowMs: number): void {
    this.accel[k] = {
      priceVelocity:
        m.priceVelocity.availability === "ok" && m.priceVelocity.value != null
          ? m.priceVelocity.value
          : this.accel[k].priceVelocity,
      tradesPerSecond:
        m.tradesPerSecond.availability === "ok" &&
        m.tradesPerSecond.value != null
          ? m.tradesPerSecond.value
          : this.accel[k].tradesPerSecond,
      atMs: nowMs,
    };
  }

  private rollSessionIfNeeded(eventMs: number): void {
    const meta = sessionMeta(eventMs);
    if (this.sessionDate === meta.sessionDate) return;
    this.sessionDate = meta.sessionDate;
    this.sessionStartMs = eventMs;
    this.sessionOpen = null;
    this.sessionHod = null;
    this.sessionLod = null;
    this.sessionVolume = 0;
    this.sessionDollar = 0;
    this.sessionTrades = 0;
    this.sessionBuy = 0;
    this.sessionSell = 0;
    this.vwapNumerator = 0;
  }

  private applyToSession(t: TradeTick): void {
    this.sessionTrades += 1;
    if (t.eligibleVol) {
      this.sessionVolume += t.size;
      this.sessionDollar += t.dollar;
      this.vwapNumerator += t.price * t.size;
    }
    if (t.eligibleLast) {
      this.lastEligiblePrice = t.price;
      if (this.sessionOpen == null) this.sessionOpen = t.price;
      if (this.sessionHod == null || t.price > this.sessionHod) {
        this.sessionHod = t.price;
      }
      if (this.sessionLod == null || t.price < this.sessionLod) {
        this.sessionLod = t.price;
      }
    }
    if (t.side === 1) this.sessionBuy += t.size;
    if (t.side === 2) this.sessionSell += t.size;
  }

  private applyToBar(t: TradeTick): void {
    const sec = Math.floor(t.t / 1000);
    const cur = this.findBar(sec);
    if (cur) {
      if (t.eligibleLast) {
        if (t.price > cur.high) cur.high = t.price;
        if (t.price < cur.low) cur.low = t.price;
        cur.close = t.price;
      }
      if (t.eligibleVol) {
        cur.volume += t.size;
        cur.dollar += t.dollar;
      }
      cur.trades += 1;
      if (t.side === 1) cur.buyVol += t.size;
      if (t.side === 2) cur.sellVol += t.size;
      return;
    }
    this.upsertBar({
      sec,
      open: t.price,
      high: t.price,
      low: t.price,
      close: t.price,
      volume: t.eligibleVol ? t.size : 0,
      dollar: t.eligibleVol ? t.dollar : 0,
      trades: 1,
      buyVol: t.side === 1 ? t.size : 0,
      sellVol: t.side === 2 ? t.size : 0,
    });
  }

  private findBar(sec: number): SecondBar | undefined {
    for (let i = 0; i < this.barCount; i++) {
      const idx =
        (this.barWrite - 1 - i + SECOND_BARS * 2) % SECOND_BARS;
      const b = this.bars[idx];
      if (!b) continue;
      if (b.sec === sec) return b;
      if (b.sec < sec) break;
    }
    return undefined;
  }

  private upsertBar(bar: SecondBar): void {
    const existing = this.findBar(bar.sec);
    if (existing) {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
      existing.dollar += bar.dollar;
      existing.trades += bar.trades;
      existing.buyVol += bar.buyVol;
      existing.sellVol += bar.sellVol;
      return;
    }
    this.bars[this.barWrite] = bar;
    this.barWrite = (this.barWrite + 1) % SECOND_BARS;
    if (this.barCount < SECOND_BARS) this.barCount += 1;
  }

  private barsToArray(): SecondBar[] {
    const out: SecondBar[] = [];
    const start =
      this.barCount === SECOND_BARS
        ? this.barWrite
        : (this.barWrite - this.barCount + SECOND_BARS) % SECOND_BARS;
    for (let i = 0; i < this.barCount; i++) {
      const b = this.bars[(start + i) % SECOND_BARS];
      if (b) out.push(b);
    }
    return out;
  }
}
