/**
 * Build a compact Monitor Replay frame from live engine outputs.
 * Call on a cadence (e.g. 1s+) — never per tick.
 */

import { MONITOR_ATTENTION_VERSION } from "@/domain/monitor/attention/version";
import { MONITOR_MARKET_STATE_VERSION } from "@/domain/monitor/market-state/version";
import { MONITOR_MOMENTUM_VERSION } from "@/domain/monitor/momentum/version";
import { MONITOR_MOMENTUM_STATE_VERSION } from "@/domain/monitor/momentum-state/version";
import {
  adjustPriceAsOf,
  buildReplayFrame,
  type CorporateActionFactor,
  type MonitorReplayFrame,
  type ReplayDataQuality,
  type ReplayEventRef,
  type ReplayRawRef,
} from "@/domain/monitor/replay";

export interface LiveCaptureInput {
  asOfMs: number;
  symbol: string;
  configHash: string;
  market: {
    lastPrice: number | null;
    priceObservedAtMs?: number;
    freshnessMs: number | null;
    tradesPerSecond: number | null;
    dollarVolumeVelocity: number | null;
    relativeVolume: number | null;
    spreadBps: number | null;
    sessionSegment: string | null;
  };
  momentum: {
    intensity: number | null;
    state: string | null;
    direction: string | null;
  };
  attention: {
    priority: number | null;
    rank: number | null;
    isLeader: boolean;
    previousRank: number | null;
  };
  events?: ReplayEventRef[];
  dataQuality: ReplayDataQuality;
  rawRefs?: ReplayRawRef[];
  corporateActions?: CorporateActionFactor[];
}

export function captureReplayFrame(input: LiveCaptureInput): MonitorReplayFrame {
  let lastPrice = input.market.lastPrice;
  let corporateActionAdjusted = false;

  if (input.corporateActions?.length && lastPrice != null) {
    const adj = adjustPriceAsOf({
      symbol: input.symbol,
      historicalPrice: lastPrice,
      historicalAtMs: input.market.priceObservedAtMs ?? input.asOfMs,
      asOfMs: input.asOfMs,
      factors: input.corporateActions,
    });
    if (!adj.excluded && adj.price != null) {
      lastPrice = adj.price;
      corporateActionAdjusted = adj.adjusted;
    }
  }

  return buildReplayFrame({
    asOfMs: input.asOfMs,
    symbol: input.symbol,
    versions: {
      marketState: MONITOR_MARKET_STATE_VERSION,
      momentum: MONITOR_MOMENTUM_VERSION,
      momentumState: MONITOR_MOMENTUM_STATE_VERSION,
      attention: MONITOR_ATTENTION_VERSION,
      configHash: input.configHash,
    },
    market: {
      ...input.market,
      lastPrice,
    },
    momentum: input.momentum,
    attention: input.attention,
    events: input.events,
    dataQuality: input.dataQuality,
    corporateActionAdjusted,
    rawRefs: input.rawRefs,
  });
}
