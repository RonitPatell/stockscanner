/**
 * Maps Yahoo poll snapshots (existing quote-stream shape) to per-second aggregates.
 * Yahoo is polled — not tick SIP. Mark entitlement honestly (often delayed/unknown).
 *
 * Redistribution of Yahoo quotes to end-users is UNRESOLVED — see
 * docs/monitor-market-data-licensing.md before enabling client fanout.
 */

import { MONITOR_MARKET_DATA_VERSION } from "../../../domain/monitor/market-data/version.ts";
import type { NormalizedAggregate } from "../../../domain/monitor/market-data/types.ts";

export interface YahooPollSnapshot {
  symbol: string;
  price: number;
  changePercent?: number;
  volume?: number;
  dayHigh?: number;
  /** Optional OHLC if available from chart APIs */
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export function yahooSnapshotToAggregate1s(
  snap: YahooPollSnapshot,
  opts: {
    sequenceNumber: number;
    windowStart: string;
    windowEnd: string;
    trustTickerReceivedAt?: string;
    delayedByMs?: number | null;
  }
): NormalizedAggregate {
  const now = opts.trustTickerReceivedAt ?? new Date().toISOString();
  const close = snap.close ?? snap.price;
  const open = snap.open ?? close;
  const high = snap.high ?? snap.dayHigh ?? Math.max(open, close);
  const low = snap.low ?? Math.min(open, close);

  return {
    type: "aggregate_1s",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol: snap.symbol.toUpperCase(),
    provider: "yahoo",
    sequenceNumber: opts.sequenceNumber,
    providerReceivedAt: opts.windowEnd,
    trustTickerReceivedAt: now,
    dataEntitlement: "delayed",
    delayedByMs: opts.delayedByMs ?? null,
    open,
    high,
    low,
    close,
    volume: snap.volume ?? 0,
    vwap: null,
    tradeCount: null,
    windowStart: opts.windowStart,
    windowEnd: opts.windowEnd,
  };
}
