/**
 * Maps Finnhub-shaped trade messages to NormalizedTrade.
 * Does not open sockets — quote-stream / workers call `toNormalizedTrade`.
 * Credentials stay in the worker process; never attach API keys to events.
 */

import { MONITOR_MARKET_DATA_VERSION } from "../../../domain/monitor/market-data/version.ts";
import type { NormalizedTrade } from "../../../domain/monitor/market-data/types.ts";

export interface FinnhubTradeMessage {
  s: string; // symbol
  p: number; // price
  v?: number; // volume/size
  t?: number; // unix ms
  c?: string[] | string; // conditions
}

export function toNormalizedTrade(
  msg: FinnhubTradeMessage,
  opts: {
    sequenceNumber: number;
    trustTickerReceivedAt?: string;
    delayedByMs?: number | null;
    dataEntitlement?: NormalizedTrade["dataEntitlement"];
    exchange?: string;
  }
): NormalizedTrade {
  const now = opts.trustTickerReceivedAt ?? new Date().toISOString();
  const sip =
    msg.t != null && Number.isFinite(msg.t)
      ? new Date(msg.t).toISOString()
      : now;
  const conditions = Array.isArray(msg.c)
    ? msg.c.map(String)
    : msg.c
      ? [String(msg.c)]
      : [];

  return {
    type: "trade",
    schemaVersion: MONITOR_MARKET_DATA_VERSION,
    symbol: String(msg.s || "").toUpperCase(),
    price: msg.p,
    size: msg.v ?? 0,
    exchange: opts.exchange ?? "FINNHUB",
    conditions,
    participantTimestamp: sip,
    sipTimestamp: sip,
    providerReceivedAt: sip,
    trustTickerReceivedAt: now,
    sequenceNumber: opts.sequenceNumber,
    tape: "unknown",
    provider: "finnhub",
    dataEntitlement: opts.dataEntitlement ?? "realtime",
    delayedByMs: opts.delayedByMs ?? null,
  };
}
