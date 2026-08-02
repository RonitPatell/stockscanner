/**
 * Pure Monitor public snapshot builder.
 * Receives already-normalized market + catalyst state — no Redis/Prisma/IO.
 */

import {
  MONITOR_SNAPSHOT_MAX_FIELD,
  MONITOR_SNAPSHOT_MAX_LADDER,
  MONITOR_SNAPSHOT_MAX_TAPE,
} from "./limits.ts";
import {
  aggregateTickerVerdict,
  classifyTimestamp,
  deriveLastMarketEventAt,
  evaluateFieldFreshness,
  inferActivityLevel,
  isLeaderEligible,
  normalizeMonitorSymbol,
  providerAsOfMs,
  selectGlobalLeader,
  snapshotLiveLabel,
  validateSymbolResolution,
} from "./freshness.ts";
import type {
  MonitorPublicSnapshot,
  MonitorSnapshotBuildInput,
  MonitorSnapshotTapeItem,
  MonitorSnapshotTicker,
  NormalizedSnapshotTickerInput,
  SnapshotDataQuality,
  SnapshotExclusionRecord,
  SnapshotSourceHealthSummary,
  SnapshotTickerSourceHealth,
  SnapshotTimestampQuality,
} from "./types.ts";
import {
  MONITOR_SNAPSHOT_CALCULATION_VERSION,
  MONITOR_SNAPSHOT_SCHEMA_VERSION,
} from "./version.ts";

function defaultHealth(): SnapshotSourceHealthSummary {
  return {
    quotes: "ok",
    catalysts: "ok",
    halts: "ok",
    coverage: "ok",
    notes: [],
  };
}

function defaultTickerHealth(
  partial?: Partial<SnapshotTickerSourceHealth> | null
): SnapshotTickerSourceHealth {
  return {
    quotes: partial?.quotes ?? "ok",
    catalysts: partial?.catalysts ?? "ok",
    trades: partial?.trades ?? "ok",
    notes: [...(partial?.notes ?? [])],
  };
}

function inferDataQuality(
  tickers: MonitorSnapshotTicker[],
  ageMs: number | null | undefined,
  explicit: SnapshotDataQuality | null | undefined,
  liveLabel: string
): SnapshotDataQuality {
  if (explicit) return explicit;
  if (!tickers.length) return "unavailable";
  if (liveLabel === "stale" || liveLabel === "unavailable") return "degraded";
  const low = tickers.filter(
    (t) =>
      t.dataConfidence === "LOW" ||
      t.dataConfidence === "UNAVAILABLE" ||
      t.haltState === "halted" ||
      t.freshnessVerdict === "stale" ||
      t.freshnessVerdict === "unavailable"
  ).length;
  if (ageMs != null && ageMs > 60_000) return "degraded";
  if (low > tickers.length / 2) return "low";
  if (low > 0) return "medium";
  return "high";
}

function qualityOf(
  explicit: SnapshotTimestampQuality | null | undefined,
  valueMs: number | null | undefined,
  nowMs: number
): SnapshotTimestampQuality {
  if (explicit) return explicit;
  return classifyTimestamp(valueMs, { nowMs }).quality;
}

function toTicker(
  input: NormalizedSnapshotTickerInput,
  rank: number,
  nowMs: number,
  session: MonitorSnapshotBuildInput["marketSession"]
): MonitorSnapshotTicker {
  const prev = input.previousRank ?? null;
  const rankChange =
    prev != null && Number.isFinite(prev) ? prev - rank : null;

  const quoteRaw =
    input.lastQuoteAtMs ?? input.quoteTimestampMs ?? null;
  const tradeRaw = input.lastTradeAtMs ?? null;
  const catalystRaw =
    input.lastCatalystAtMs ??
    input.catalyst?.lastConfirmedAtMs ??
    input.catalyst?.firstSeenAtMs ??
    null;
  const momentumRaw = input.momentumCalculatedAtMs ?? null;
  const priorityRaw = input.priorityCalculatedAtMs ?? null;
  const tradeabilityRaw = input.tradeabilityCalculatedAtMs ?? null;

  const quoteQ = qualityOf(input.lastQuoteAtQuality, quoteRaw, nowMs);
  const tradeQ = qualityOf(input.lastTradeAtQuality, tradeRaw, nowMs);
  const catalystQ = qualityOf(
    input.lastCatalystAtQuality,
    catalystRaw,
    nowMs
  );
  const momentumQ = qualityOf(
    input.momentumCalculatedAtQuality,
    momentumRaw,
    nowMs
  );
  const priorityQ = qualityOf(
    input.priorityCalculatedAtQuality,
    priorityRaw,
    nowMs
  );
  const tradeabilityQ = qualityOf(
    input.tradeabilityCalculatedAtQuality,
    tradeabilityRaw,
    nowMs
  );

  const quoteMs = quoteQ === "invalid" || quoteQ === "missing" ? null : quoteRaw;
  const tradeMs = tradeQ === "invalid" || tradeQ === "missing" ? null : tradeRaw;
  const catalystMs =
    catalystQ === "invalid" || catalystQ === "missing" ? null : catalystRaw;
  const momentumMs =
    momentumQ === "invalid" || momentumQ === "missing" ? null : momentumRaw;
  const priorityMs =
    priorityQ === "invalid" || priorityQ === "missing" ? null : priorityRaw;
  const tradeabilityMs =
    tradeabilityQ === "invalid" || tradeabilityQ === "missing"
      ? null
      : tradeabilityRaw;

  const marketEventMs =
    input.lastMarketEventAtMs ??
    deriveLastMarketEventAt({
      lastQuoteAtMs: quoteMs,
      lastTradeAtMs: tradeMs,
      lastCatalystAtMs: catalystMs,
      momentumCalculatedAtMs: momentumMs,
      priorityCalculatedAtMs: priorityMs,
      tradeabilityCalculatedAtMs: tradeabilityMs,
    });
  const marketEventQ = qualityOf(
    input.lastMarketEventAtQuality,
    marketEventMs,
    nowMs
  );
  const marketEventFinal =
    marketEventQ === "invalid" || marketEventQ === "missing"
      ? null
      : marketEventMs;

  const activity =
    input.activityLevel ??
    inferActivityLevel({
      attentionPriority: input.attentionPriority,
      tradesPerSecond: input.tradesPerSecond,
    });

  const fieldFreshness = evaluateFieldFreshness({
    nowMs,
    session,
    activity,
    provider: input.provider,
    quoteMs,
    quoteQuality: quoteQ,
    tradeMs,
    tradeQuality: tradeQ,
    catalystMs,
    catalystQuality: catalystQ,
    momentumMs,
    momentumQuality: momentumQ,
    priorityMs,
    priorityQuality: priorityQ,
    tradeabilityMs,
    tradeabilityQuality: tradeabilityQ,
    marketEventMs: marketEventFinal,
    marketEventQuality: marketEventQ,
  });

  const freshnessVerdict = aggregateTickerVerdict(fieldFreshness, {
    quarantined: Boolean(input.quarantined),
  });

  let primaryRisk = input.primaryRisk ?? "unknown";
  if (
    (freshnessVerdict === "stale" || freshnessVerdict === "unavailable") &&
    (primaryRisk === "none" || primaryRisk === "unknown")
  ) {
    primaryRisk = "stale_data";
  }

  const dataConfidence =
    input.dataConfidence ??
    (freshnessVerdict === "stale" || freshnessVerdict === "unavailable"
      ? "LOW"
      : freshnessVerdict === "aging"
        ? "MEDIUM"
        : "MEDIUM");

  const eligibility = isLeaderEligible({
    haltState: input.haltState ?? "none",
    freshnessVerdict,
    fieldFreshness,
    quarantined: Boolean(input.quarantined),
    dataConfidence,
  });

  const sourceHealth = defaultTickerHealth(input.sourceHealth);
  const quoteField = fieldFreshness.find((f) => f.field === "quote");
  if (quoteField?.verdict === "stale") sourceHealth.quotes = "stale";
  else if (quoteField?.verdict === "aging") sourceHealth.quotes = "degraded";
  else if (quoteField?.verdict === "unavailable") sourceHealth.quotes = "down";

  const tradeField = fieldFreshness.find((f) => f.field === "trade");
  if (tradeField?.verdict === "stale") sourceHealth.trades = "stale";
  else if (tradeField?.verdict === "aging") sourceHealth.trades = "degraded";
  else if (tradeField?.verdict === "unavailable") sourceHealth.trades = "down";

  const catField = fieldFreshness.find((f) => f.field === "catalyst");
  if (catField?.verdict === "stale") sourceHealth.catalysts = "stale";
  else if (catField?.verdict === "aging") sourceHealth.catalysts = "degraded";

  return {
    symbol: input.symbol.toUpperCase(),
    companyShortName: input.companyShortName ?? null,
    price: input.price ?? null,
    sessionChangePct: input.sessionChangePct ?? null,
    rank,
    rankChange,
    momentumIntensity: input.momentumIntensity ?? null,
    momentumState: input.momentumState ?? null,
    direction: input.direction ?? null,
    attentionPriority: input.attentionPriority,
    reactionStage: input.reactionStage ?? "unknown",
    tradeability: input.tradeability ?? "UNKNOWN",
    primaryRisk,
    catalyst: input.catalyst
      ? {
          headline: input.catalyst.headline ?? null,
          category: input.catalyst.category ?? null,
          materiality: input.catalyst.materiality ?? null,
          verified: Boolean(input.catalyst.verified),
          firstSeenAtMs: input.catalyst.firstSeenAtMs ?? null,
          lastConfirmedAtMs: input.catalyst.lastConfirmedAtMs ?? null,
        }
      : null,
    quoteTimestampMs: quoteMs,
    dataConfidence,
    haltState: input.haltState ?? "none",
    snapshotGeneratedAtMs: nowMs,
    lastMarketEventAtMs: marketEventFinal,
    lastQuoteAtMs: quoteMs,
    lastTradeAtMs: tradeMs,
    lastCatalystAtMs: catalystMs,
    momentumCalculatedAtMs: momentumMs,
    priorityCalculatedAtMs: priorityMs,
    tradeabilityCalculatedAtMs: tradeabilityMs,
    activityLevel: activity,
    sourceHealth,
    fieldFreshness,
    freshnessVerdict,
    leaderEligible: eligibility.ok,
    leaderIneligibleReason: eligibility.ok
      ? null
      : eligibility.reason ?? "not_eligible",
    calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
  };
}

function sortByAttention(
  tickers: NormalizedSnapshotTickerInput[]
): NormalizedSnapshotTickerInput[] {
  return [...tickers].sort(
    (a, b) =>
      b.attentionPriority - a.attentionPriority ||
      a.symbol.localeCompare(b.symbol)
  );
}

function clipTape(
  events: MonitorSnapshotTapeItem[] | undefined
): MonitorSnapshotTapeItem[] {
  if (!events?.length) return [];
  return [...events]
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, MONITOR_SNAPSHOT_MAX_TAPE)
    .map((e) => ({
      id: e.id,
      atMs: e.atMs,
      symbol: normalizeMonitorSymbol(e.symbol) ?? e.symbol.toUpperCase(),
      type: e.type,
      label: e.label.slice(0, 120),
      severity: e.severity,
      explanation: e.explanation.slice(0, 280),
    }));
}

function makeSnapshotId(lastEventId: string, generatedAtMs: number): string {
  return `snap_${lastEventId}_${generatedAtMs}`;
}

function filterResolvedTickers(
  tickers: NormalizedSnapshotTickerInput[],
  quarantined: Set<string>,
  conflicted: Set<string>,
  preExcluded: SnapshotExclusionRecord[]
): {
  accepted: NormalizedSnapshotTickerInput[];
  excluded: SnapshotExclusionRecord[];
} {
  const excluded: SnapshotExclusionRecord[] = [...preExcluded];
  const accepted: NormalizedSnapshotTickerInput[] = [];
  const seen = new Set<string>();

  for (const t of tickers) {
    const resolved = validateSymbolResolution({
      symbol: t.symbol,
      conflicted: Boolean(t.conflictedMapping) || conflicted.has(t.symbol.toUpperCase()),
      quarantined: Boolean(t.quarantined) || quarantined.has(t.symbol.toUpperCase()),
    });
    if (!resolved.ok) {
      excluded.push({
        symbol: String(t.symbol || "?").toUpperCase(),
        reason: resolved.reason,
        stage:
          resolved.reason === "quarantined_ticker"
            ? "quarantine"
            : resolved.reason === "conflicted_ticker_mapping"
              ? "quarantine"
              : "resolve",
      });
      continue;
    }
    if (seen.has(resolved.symbol)) {
      excluded.push({
        symbol: resolved.symbol,
        reason: "duplicate_symbol",
        stage: "resolve",
      });
      continue;
    }
    seen.add(resolved.symbol);
    accepted.push({
      ...t,
      symbol: resolved.symbol,
      quarantined: false,
      conflictedMapping: false,
    });
  }
  return { accepted, excluded };
}

/**
 * Build a complete public Monitor snapshot from normalized inputs.
 * Caps ladder (10), field (12), tape (50). Deterministic for identical inputs.
 */
export function buildMonitorPublicSnapshot(
  input: MonitorSnapshotBuildInput
): MonitorPublicSnapshot {
  const nowMs = input.nowMs;
  const quarantined = new Set(
    (input.quarantinedSymbols ?? []).map((s) => s.toUpperCase())
  );
  const conflicted = new Set(
    (input.conflictedSymbols ?? []).map((s) => s.toUpperCase())
  );

  const { accepted, excluded } = filterResolvedTickers(
    input.tickers,
    quarantined,
    conflicted,
    input.preExcluded ?? []
  );

  const sorted = sortByAttention(accepted);
  const ladderInputs = sorted.slice(0, MONITOR_SNAPSHOT_MAX_LADDER);
  const fieldInputs = sorted.slice(0, MONITOR_SNAPSHOT_MAX_FIELD);

  const prevRankBySymbol = new Map<string, number>();
  if (input.previous) {
    for (const row of input.previous.priorityLadder) {
      if (row.rank != null) prevRankBySymbol.set(row.symbol, row.rank);
    }
  }

  const withPrev = (t: NormalizedSnapshotTickerInput) => ({
    ...t,
    previousRank:
      t.previousRank ?? prevRankBySymbol.get(t.symbol.toUpperCase()) ?? null,
  });

  const priorityLadder = ladderInputs.map((t, i) =>
    toTicker(withPrev(t), i + 1, nowMs, input.marketSession)
  );
  const momentumField = fieldInputs.map((t, i) =>
    toTicker(withPrev(t), i + 1, nowMs, input.marketSession)
  );

  const leaderPick = selectGlobalLeader(
    priorityLadder.map((t) => ({
      symbol: t.symbol,
      attentionPriority: t.attentionPriority ?? 0,
      leaderEligible: t.leaderEligible,
      leaderIneligibleReason: t.leaderIneligibleReason,
    }))
  );

  for (const ex of leaderPick.exclusions) {
    excluded.push({
      symbol: ex.symbol,
      reason: `leader_skipped:${ex.reason}`,
      stage: "leader",
    });
  }

  const health: SnapshotSourceHealthSummary = {
    ...defaultHealth(),
    ...(input.sourceHealth ?? {}),
    notes: [...(input.sourceHealth?.notes ?? [])],
  };

  const underlyingAges = priorityLadder
    .map((t) => {
      const asOf = providerAsOfMs(t);
      return asOf == null ? null : Math.max(0, nowMs - asOf);
    })
    .filter((n): n is number => n != null);

  const underlyingDataAgeMs = underlyingAges.length
    ? Math.max(...underlyingAges)
    : input.marketStateAgeMs ?? null;

  const live = snapshotLiveLabel({
    recovery: Boolean(input.recovery),
    underlyingDataAgeMs,
    sourceQuotes: health.quotes,
    session: input.marketSession,
  });

  if (!live.liveEligible && !health.notes.some((n) => n.startsWith("live:"))) {
    health.notes.push(`live:${live.liveLabel}`);
  }

  const generatedAtMs = nowMs;
  const lastEventId = String(input.lastEventId);
  const snapshotId =
    input.snapshotId?.trim() || makeSnapshotId(lastEventId, generatedAtMs);

  const dataQuality = inferDataQuality(
    priorityLadder,
    underlyingDataAgeMs,
    input.dataQuality,
    live.liveLabel
  );

  return {
    schemaVersion: MONITOR_SNAPSHOT_SCHEMA_VERSION,
    calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
    snapshotId,
    lastEventId,
    generatedAt: new Date(generatedAtMs).toISOString(),
    generatedAtMs,
    marketSession: input.marketSession,
    globalLeader: leaderPick.symbol,
    priorityLadder,
    momentumField,
    recentEventTape: clipTape(input.tapeEvents),
    sourceHealthSummary: health,
    dataQuality,
    marketStateAgeMs: underlyingDataAgeMs,
    recovery: Boolean(input.recovery),
    freshness: {
      snapshotAgeMs: 0,
      underlyingDataAgeMs,
      liveEligible: live.liveEligible,
      liveLabel: live.liveLabel,
      excludedTickers: excluded,
      leaderExclusions: leaderPick.exclusions,
      generationDurationMs: input.generationDurationMs ?? null,
      schemaVersion: MONITOR_SNAPSHOT_SCHEMA_VERSION,
      calculationVersion: MONITOR_SNAPSHOT_CALCULATION_VERSION,
    },
  };
}

/** Map public snapshot tickers → delivery hub–compatible compact rows. */
export function publicSnapshotToDeliverySymbols(
  snap: MonitorPublicSnapshot
): Array<{
  symbol: string;
  rank: number | null;
  attentionPriority: number | null;
  momentumState: string | null;
  momentumIntensity: number | null;
  direction: "up" | "down" | "neutral" | null;
  halted: boolean;
  criticalEvent: boolean;
  asOfMs: number;
  stale: boolean;
}> {
  const out: Array<{
    symbol: string;
    rank: number | null;
    attentionPriority: number | null;
    momentumState: string | null;
    momentumIntensity: number | null;
    direction: "up" | "down" | "neutral" | null;
    halted: boolean;
    criticalEvent: boolean;
    asOfMs: number;
    stale: boolean;
  }> = [];

  for (const t of snap.priorityLadder) {
    const asOf = providerAsOfMs(t);
    // Never substitute snapshotGeneratedAt / server time for missing provider time.
    if (asOf == null) continue;
    out.push({
      symbol: t.symbol,
      rank: t.rank,
      attentionPriority: t.attentionPriority,
      momentumState: t.momentumState,
      momentumIntensity: t.momentumIntensity,
      direction:
        t.direction === "up" ||
        t.direction === "down" ||
        t.direction === "neutral"
          ? t.direction
          : null,
      halted: t.haltState === "halted" || t.haltState === "news_disseminated",
      criticalEvent: t.primaryRisk === "halt" || t.primaryRisk === "regulatory",
      asOfMs: asOf,
      stale:
        t.freshnessVerdict === "stale" ||
        t.freshnessVerdict === "unavailable" ||
        t.freshnessVerdict === "quarantined",
    });
  }
  return out;
}
