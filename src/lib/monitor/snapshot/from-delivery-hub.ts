/**
 * Build normalized snapshot inputs from the process-local delivery hub
 * (already-normalized market envelopes). No engine recompute here.
 */

import type {
  MonitorSnapshotBuildInput,
  MonitorSnapshotTapeItem,
  NormalizedSnapshotTickerInput,
  SnapshotExclusionRecord,
  SnapshotHaltState,
  SnapshotPrimaryRisk,
  SnapshotTimestampQuality,
} from "../../../domain/monitor/snapshot/index.ts";
import {
  classifyTimestamp,
  normalizeMonitorSymbol,
} from "../../../domain/monitor/snapshot/index.ts";
import { getSessionContext } from "../../../domain/monitor/market-state/session.ts";
import type { MonitorDeliveryHub } from "../../../domain/monitor/delivery/index.ts";
import { isTickerQuarantined } from "../../../domain/monitor/ops/index.ts";
import { getMonitorOpsControlsSync } from "../ops/controls-store.ts";

function haltState(halted: boolean): SnapshotHaltState {
  return halted ? "halted" : "none";
}

function primaryRisk(halted: boolean, critical: boolean): SnapshotPrimaryRisk {
  if (halted) return "halt";
  if (critical) return "regulatory";
  return "none";
}

function quoteQuality(input: {
  asOfMs: number;
  nowMs: number;
  availability: string;
  stale: boolean;
}): SnapshotTimestampQuality {
  const base = classifyTimestamp(input.asOfMs, { nowMs: input.nowMs });
  if (base.quality === "invalid" || base.quality === "missing") {
    return base.quality;
  }
  if (
    input.availability === "estimated" ||
    input.availability === "unavailable"
  ) {
    return "estimated";
  }
  if (input.stale || input.availability === "stale") {
    return "provider";
  }
  return "provider";
}

export function buildInputFromDeliveryHub(
  hub: MonitorDeliveryHub,
  opts?: {
    nowMs?: number;
    tapeEvents?: MonitorSnapshotTapeItem[];
    companyNames?: Record<string, string | null>;
    conflictedSymbols?: string[];
    quarantinedSymbols?: string[];
  }
): MonitorSnapshotBuildInput {
  const nowMs = opts?.nowMs ?? Date.now();
  const snap = hub.latestSnapshot();
  const session = getSessionContext(nowMs).segment;
  const names = opts?.companyNames ?? {};
  const controls = getMonitorOpsControlsSync();
  const conflicted = new Set(
    (opts?.conflictedSymbols ?? []).map((s) => s.toUpperCase())
  );
  const quarantined = new Set([
    ...controls.quarantinedTickers.map((s) => s.toUpperCase()),
    ...(opts?.quarantinedSymbols ?? []).map((s) => s.toUpperCase()),
  ]);

  const tickers: NormalizedSnapshotTickerInput[] = [];
  const preExcluded: SnapshotExclusionRecord[] = [];
  const ages: number[] = [];

  for (const s of snap.symbols) {
    const symbol = normalizeMonitorSymbol(s.symbol);
    if (!symbol) {
      preExcluded.push({
        symbol: String(s.symbol || "?").toUpperCase(),
        reason: "invalid_symbol_resolution",
        stage: "resolve",
      });
      continue;
    }
    if (conflicted.has(symbol)) {
      preExcluded.push({
        symbol,
        reason: "conflicted_ticker_mapping",
        stage: "quarantine",
      });
      continue;
    }
    if (quarantined.has(symbol) || isTickerQuarantined(controls, symbol)) {
      preExcluded.push({
        symbol,
        reason: "quarantined_ticker",
        stage: "quarantine",
      });
      continue;
    }

    const asOfClassified = classifyTimestamp(s.asOfMs, { nowMs });
    const qQuality = quoteQuality({
      asOfMs: s.asOfMs,
      nowMs,
      availability: s.dataAvailability,
      stale: s.stale,
    });
    const quoteMs =
      asOfClassified.quality === "invalid" || asOfClassified.quality === "missing"
        ? null
        : asOfClassified.valueMs;

    if (quoteMs != null) {
      ages.push(Math.max(0, nowMs - quoteMs));
    }

    tickers.push({
      symbol,
      companyShortName: names[symbol] ?? names[s.symbol] ?? null,
      price: null,
      sessionChangePct: null,
      attentionPriority: s.attentionPriority ?? 0,
      momentumIntensity: s.momentumIntensity,
      momentumState: s.momentumState,
      direction: s.direction,
      reactionStage: "unknown",
      tradeability: "UNKNOWN",
      primaryRisk: primaryRisk(s.halted, s.criticalEvent),
      catalyst: null,
      quoteTimestampMs: quoteMs,
      lastQuoteAtMs: quoteMs,
      lastQuoteAtQuality: qQuality,
      lastMarketEventAtMs: quoteMs,
      lastMarketEventAtQuality: qQuality,
      // Delivery hub does not yet expose trade/calc clocks — leave null
      // rather than substituting serialization time.
      lastTradeAtMs: null,
      lastTradeAtQuality: "missing",
      momentumCalculatedAtMs: null,
      momentumCalculatedAtQuality: "missing",
      priorityCalculatedAtMs: null,
      priorityCalculatedAtQuality: "missing",
      tradeabilityCalculatedAtMs: null,
      tradeabilityCalculatedAtQuality: "missing",
      dataConfidence: s.stale || qQuality === "estimated" ? "LOW" : "MEDIUM",
      haltState: haltState(s.halted),
      previousRank: s.rank,
      provider: "hub",
      sourceHealth: {
        quotes: s.stale
          ? "stale"
          : s.dataAvailability === "degraded"
            ? "degraded"
            : s.dataAvailability === "unavailable"
              ? "down"
              : "ok",
        catalysts: "ok",
        trades: "down",
        notes:
          qQuality === "estimated"
            ? ["quote_time_estimated"]
            : quoteMs == null
              ? ["quote_time_missing"]
              : [],
      },
    });
  }

  const marketStateAgeMs = ages.length ? Math.max(...ages) : null;

  return {
    nowMs,
    lastEventId: String(snap.sequence || 0),
    marketSession: session,
    tickers,
    tapeEvents: opts?.tapeEvents ?? [],
    sourceHealth: {
      quotes:
        snap.health === "live"
          ? "ok"
          : snap.health === "degraded"
            ? "degraded"
            : "stale",
      catalysts: "ok",
      halts: "ok",
      coverage: "ok",
      notes: [...snap.dataNotes],
    },
    marketStateAgeMs,
    dataQuality:
      snap.health === "live"
        ? "high"
        : snap.health === "degraded"
          ? "degraded"
          : "low",
    recovery: snap.health === "recovering",
    quarantinedSymbols: [...quarantined],
    conflictedSymbols: [...conflicted],
    preExcluded,
  };
}
