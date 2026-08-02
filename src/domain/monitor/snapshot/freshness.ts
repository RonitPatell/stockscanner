/**
 * Freshness policies for preloaded Monitor snapshots.
 * Provider times are never invented from the server clock.
 */

import type { SessionSegment } from "../market-state/session.ts";
import type {
  FreshnessDataKind,
  FreshnessVerdict,
  SnapshotFieldFreshness,
  SnapshotLiveLabel,
  SnapshotTimestampQuality,
  TickerActivityLevel,
} from "./types.ts";

export interface FreshnessThresholds {
  agingAgeMs: number;
  staleAgeMs: number;
}

export interface TickerTimestampBundle {
  snapshotGeneratedAtMs: number;
  lastMarketEventAtMs: number | null;
  lastQuoteAtMs: number | null;
  lastTradeAtMs: number | null;
  lastCatalystAtMs: number | null;
  momentumCalculatedAtMs: number | null;
  priorityCalculatedAtMs: number | null;
  tradeabilityCalculatedAtMs: number | null;
}

const SESSION_MULT: Record<SessionSegment, number> = {
  open_auction: 0.6,
  regular: 1,
  premarket: 1.4,
  after_hours: 1.6,
  closed: 4,
};

const ACTIVITY_MULT: Record<TickerActivityLevel, number> = {
  burst: 0.7,
  active: 1,
  quiet: 1.8,
};

const PROVIDER_MULT: Record<string, number> = {
  finnhub: 1,
  polygon: 1,
  hub: 1.1,
  unknown: 1.3,
  estimated: 1.5,
};

const BASE_THRESHOLDS: Record<
  FreshnessDataKind,
  FreshnessThresholds
> = {
  quote: { agingAgeMs: 3_000, staleAgeMs: 8_000 },
  trade: { agingAgeMs: 4_000, staleAgeMs: 12_000 },
  catalyst: { agingAgeMs: 60_000, staleAgeMs: 300_000 },
  halt: { agingAgeMs: 15_000, staleAgeMs: 60_000 },
  momentum: { agingAgeMs: 5_000, staleAgeMs: 15_000 },
  attention: { agingAgeMs: 5_000, staleAgeMs: 15_000 },
  tradeability: { agingAgeMs: 10_000, staleAgeMs: 30_000 },
  market_event: { agingAgeMs: 4_000, staleAgeMs: 12_000 },
};

/** US equity-style symbol: 1–10 chars, starts with letter; optional ./- class. */
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,9}$/;

export function normalizeMonitorSymbol(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s || !SYMBOL_RE.test(s)) return null;
  return s;
}

export function validateSymbolResolution(input: {
  symbol: string | null | undefined;
  conflicted?: boolean;
  quarantined?: boolean;
}): { ok: true; symbol: string } | { ok: false; reason: string } {
  const symbol = normalizeMonitorSymbol(input.symbol);
  if (!symbol) {
    return { ok: false, reason: "invalid_symbol_resolution" };
  }
  if (input.conflicted) {
    return { ok: false, reason: "conflicted_ticker_mapping" };
  }
  if (input.quarantined) {
    return { ok: false, reason: "quarantined_ticker" };
  }
  return { ok: true, symbol };
}

export function inferActivityLevel(input: {
  attentionPriority?: number | null;
  tradesPerSecond?: number | null;
}): TickerActivityLevel {
  const tps = input.tradesPerSecond;
  if (tps != null && Number.isFinite(tps) && tps >= 8) return "burst";
  if (tps != null && Number.isFinite(tps) && tps >= 1.5) return "active";
  const ap = input.attentionPriority ?? 0;
  if (ap >= 85) return "burst";
  if (ap >= 45) return "active";
  return "quiet";
}

export function thresholdsFor(
  session: SessionSegment,
  kind: FreshnessDataKind,
  opts?: { provider?: string | null; activity?: TickerActivityLevel }
): FreshnessThresholds {
  const base = BASE_THRESHOLDS[kind];
  const providerKey = (opts?.provider ?? "unknown").trim().toLowerCase();
  const mult =
    (SESSION_MULT[session] ?? 1) *
    (ACTIVITY_MULT[opts?.activity ?? "active"] ?? 1) *
    (PROVIDER_MULT[providerKey] ?? PROVIDER_MULT.unknown);
  return {
    agingAgeMs: Math.round(base.agingAgeMs * mult),
    staleAgeMs: Math.round(base.staleAgeMs * mult),
  };
}

/**
 * Age from a provider timestamp. Missing/invalid → null (never Date.now() fill).
 * Estimated timestamps still yield an age but must be labelled by callers.
 */
export function ageMs(
  providerTimeMs: number | null | undefined,
  nowMs: number,
  quality: SnapshotTimestampQuality = "provider"
): number | null {
  if (providerTimeMs == null || !Number.isFinite(providerTimeMs)) return null;
  if (quality === "missing" || quality === "invalid") return null;
  if (providerTimeMs > nowMs + 5_000) return null; // future clock skew → invalid
  return Math.max(0, nowMs - providerTimeMs);
}

export function verdictFor(
  providerTimeMs: number | null | undefined,
  nowMs: number,
  thresholds: FreshnessThresholds,
  quality: SnapshotTimestampQuality = "provider"
): FreshnessVerdict {
  if (quality === "missing" || providerTimeMs == null) return "unavailable";
  if (quality === "invalid") return "unavailable";
  const age = ageMs(providerTimeMs, nowMs, quality);
  if (age == null) return "unavailable";
  if (age > thresholds.staleAgeMs) return "stale";
  if (age > thresholds.agingAgeMs || quality === "estimated") return "aging";
  return "fresh";
}

export function classifyTimestamp(
  valueMs: number | null | undefined,
  opts?: { estimated?: boolean; nowMs?: number }
): { valueMs: number | null; quality: SnapshotTimestampQuality } {
  if (valueMs == null || !Number.isFinite(valueMs) || valueMs <= 0) {
    return { valueMs: null, quality: "missing" };
  }
  if (opts?.nowMs != null && valueMs > opts.nowMs + 5_000) {
    return { valueMs: null, quality: "invalid" };
  }
  if (opts?.estimated) {
    return { valueMs, quality: "estimated" };
  }
  return { valueMs, quality: "provider" };
}

function maxFinite(values: Array<number | null | undefined>): number | null {
  let max: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

export function deriveLastMarketEventAt(
  ts: Omit<TickerTimestampBundle, "snapshotGeneratedAtMs" | "lastMarketEventAtMs">
): number | null {
  return maxFinite([
    ts.lastQuoteAtMs,
    ts.lastTradeAtMs,
    ts.lastCatalystAtMs,
    ts.momentumCalculatedAtMs,
    ts.priorityCalculatedAtMs,
    ts.tradeabilityCalculatedAtMs,
  ]);
}

export function evaluateFieldFreshness(input: {
  nowMs: number;
  session: SessionSegment;
  activity: TickerActivityLevel;
  provider?: string | null;
  quoteMs: number | null;
  quoteQuality: SnapshotTimestampQuality;
  tradeMs: number | null;
  tradeQuality: SnapshotTimestampQuality;
  catalystMs: number | null;
  catalystQuality: SnapshotTimestampQuality;
  momentumMs: number | null;
  momentumQuality: SnapshotTimestampQuality;
  priorityMs: number | null;
  priorityQuality: SnapshotTimestampQuality;
  tradeabilityMs: number | null;
  tradeabilityQuality: SnapshotTimestampQuality;
  marketEventMs: number | null;
  marketEventQuality: SnapshotTimestampQuality;
}): SnapshotFieldFreshness[] {
  const provider = input.provider ?? "unknown";
  const activity = input.activity;
  const session = input.session;
  const nowMs = input.nowMs;

  const rows: Array<{
    field: SnapshotFieldFreshness["field"];
    kind: FreshnessDataKind;
    ms: number | null;
    quality: SnapshotTimestampQuality;
  }> = [
    {
      field: "quote",
      kind: "quote",
      ms: input.quoteMs,
      quality: input.quoteQuality,
    },
    {
      field: "trade",
      kind: "trade",
      ms: input.tradeMs,
      quality: input.tradeQuality,
    },
    {
      field: "catalyst",
      kind: "catalyst",
      ms: input.catalystMs,
      quality: input.catalystQuality,
    },
    {
      field: "momentum",
      kind: "momentum",
      ms: input.momentumMs,
      quality: input.momentumQuality,
    },
    {
      field: "priority",
      kind: "attention",
      ms: input.priorityMs,
      quality: input.priorityQuality,
    },
    {
      field: "tradeability",
      kind: "tradeability",
      ms: input.tradeabilityMs,
      quality: input.tradeabilityQuality,
    },
    {
      field: "market_event",
      kind: "market_event",
      ms: input.marketEventMs,
      quality: input.marketEventQuality,
    },
  ];

  return rows.map((r) => {
    const th = thresholdsFor(session, r.kind, { provider, activity });
    const verdict = verdictFor(r.ms, nowMs, th, r.quality);
    const age = ageMs(r.ms, nowMs, r.quality);
    let reason = "fresh";
    if (verdict === "unavailable") {
      reason =
        r.quality === "invalid"
          ? "invalid_provider_timestamp"
          : r.quality === "estimated"
            ? "estimated_timestamp_unusable"
            : "missing_provider_timestamp";
    } else if (verdict === "stale") {
      reason = `age_ms_${age ?? "?"}_gt_stale_${th.staleAgeMs}`;
    } else if (verdict === "aging") {
      reason =
        r.quality === "estimated"
          ? "estimated_timestamp_labeled"
          : `age_ms_${age ?? "?"}_gt_aging_${th.agingAgeMs}`;
    }
    return {
      field: r.field,
      verdict,
      reason,
      providerTimeMs: r.quality === "invalid" ? null : r.ms,
      timeQuality: r.quality,
      ageMs: age,
    };
  });
}

export function aggregateTickerVerdict(
  fields: SnapshotFieldFreshness[],
  opts?: { quarantined?: boolean }
): FreshnessVerdict {
  if (opts?.quarantined) return "quarantined";
  const quote = fields.find((f) => f.field === "quote");
  const market = fields.find((f) => f.field === "market_event");
  const primary = quote?.verdict ?? market?.verdict ?? "unavailable";
  if (primary === "stale" || primary === "unavailable") return primary;
  const anyStale = fields.some(
    (f) => f.verdict === "stale" && f.field !== "catalyst"
  );
  if (anyStale) return "stale";
  const anyAging = fields.some((f) => f.verdict === "aging");
  if (anyAging || primary === "aging") return "aging";
  if (primary === "fresh") return "fresh";
  return "unavailable";
}

export function isLeaderEligible(input: {
  haltState: string;
  freshnessVerdict: FreshnessVerdict;
  fieldFreshness: SnapshotFieldFreshness[];
  quarantined?: boolean;
  dataConfidence?: string | null;
}): { ok: boolean; reason?: string } {
  if (input.quarantined) {
    return { ok: false, reason: "quarantined" };
  }
  if (
    input.haltState === "halted" ||
    input.haltState === "news_disseminated"
  ) {
    return { ok: false, reason: "halted" };
  }
  if (
    input.freshnessVerdict === "stale" ||
    input.freshnessVerdict === "unavailable" ||
    input.freshnessVerdict === "quarantined"
  ) {
    return { ok: false, reason: `freshness_${input.freshnessVerdict}` };
  }
  const quote = input.fieldFreshness.find((f) => f.field === "quote");
  if (
    !quote ||
    quote.verdict === "stale" ||
    quote.verdict === "unavailable"
  ) {
    return { ok: false, reason: "quote_not_fresh" };
  }
  if (
    input.dataConfidence === "LOW" ||
    input.dataConfidence === "UNAVAILABLE"
  ) {
    return { ok: false, reason: "low_data_confidence" };
  }
  return { ok: true };
}

export function selectGlobalLeader(
  tickers: Array<{
    symbol: string;
    attentionPriority: number;
    leaderEligible: boolean;
    leaderIneligibleReason: string | null;
  }>
): {
  symbol: string | null;
  exclusions: Array<{ symbol: string; reason: string }>;
} {
  const exclusions: Array<{ symbol: string; reason: string }> = [];
  const sorted = [...tickers].sort(
    (a, b) =>
      b.attentionPriority - a.attentionPriority ||
      a.symbol.localeCompare(b.symbol)
  );
  for (const t of sorted) {
    if (t.leaderEligible) {
      return { symbol: t.symbol, exclusions };
    }
    exclusions.push({
      symbol: t.symbol,
      reason: t.leaderIneligibleReason ?? "not_leader_eligible",
    });
  }
  return { symbol: null, exclusions };
}

/**
 * Snapshot "live" label from underlying market inputs — never from
 * serialization/generatedAt alone.
 */
export function snapshotLiveLabel(input: {
  recovery: boolean;
  underlyingDataAgeMs: number | null;
  sourceQuotes: "ok" | "degraded" | "stale" | "down";
  session: SessionSegment;
  activity?: TickerActivityLevel;
  provider?: string | null;
}): { liveEligible: boolean; liveLabel: SnapshotLiveLabel } {
  if (input.recovery) {
    return { liveEligible: false, liveLabel: "recovery" };
  }
  if (
    input.sourceQuotes === "down" ||
    input.sourceQuotes === "stale" ||
    input.underlyingDataAgeMs == null
  ) {
    return { liveEligible: false, liveLabel: "unavailable" };
  }
  const th = thresholdsFor(input.session, "market_event", {
    provider: input.provider ?? "hub",
    activity: input.activity ?? "active",
  });
  if (input.underlyingDataAgeMs > th.staleAgeMs) {
    return { liveEligible: false, liveLabel: "stale" };
  }
  if (
    input.underlyingDataAgeMs > th.agingAgeMs ||
    input.sourceQuotes === "degraded"
  ) {
    return { liveEligible: false, liveLabel: "aging" };
  }
  return { liveEligible: true, liveLabel: "live" };
}

/** Provider time for delivery/sync — never falls back to snapshotGeneratedAt. */
export function providerAsOfMs(ts: {
  lastQuoteAtMs?: number | null;
  lastTradeAtMs?: number | null;
  lastMarketEventAtMs?: number | null;
  quoteTimestampMs?: number | null;
}): number | null {
  return maxFinite([
    ts.lastQuoteAtMs,
    ts.lastTradeAtMs,
    ts.lastMarketEventAtMs,
    ts.quoteTimestampMs,
  ]);
}
