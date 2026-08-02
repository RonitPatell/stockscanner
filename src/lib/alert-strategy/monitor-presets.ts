/**
 * Monitor presets — apply Alert Strategy AST as an inspection filter.
 * Never mutates a saved strategy silently; catalog builds are fresh v1 copies.
 */

import { evaluateStrategy } from "./evaluate.ts";
import { explainStrategyMatch } from "./explain.ts";
import {
  MONITOR_PRESET_IDS,
  STRATEGY_PRESET_META,
  buildPreset,
} from "./presets.ts";
import { simulateStrategy, type SimulationCatalystRow } from "./simulate.ts";
import { summarizeMonitorPreset } from "./summarize.ts";
import { validateStrategy } from "./validate.ts";
import { strategyContentHash } from "./versioning.ts";
import type {
  AlertStrategy,
  StrategyEvalFacts,
  StrategyExplainResult,
  StrategyPresetId,
  StrategyValidationIssue,
} from "./types.ts";

export interface MonitorSymbolFactsInput {
  symbol: string;
  onWatchlist: boolean;
  price?: number | null;
  sessionChangePct?: number | null;
  floatM?: number | null;
  floatConfidence?: StrategyEvalFacts["floatConfidence"];
  marketCapM?: number | null;
  momentumState?: string | null;
  momentumIntensity?: number | null;
  attentionPriority?: number | null;
  relativeVolume?: number | null;
  dollarVolume?: number | null;
  dollarVolumeVelocity?: number | null;
  tradesPerSecond?: number | null;
  spreadBps?: number | null;
  tradeability?: string | null;
  catalystCategory?: string | null;
  sourceTier?: string | null;
  sourceVerification?: StrategyEvalFacts["sourceVerification"];
  confirmationCount?: number | null;
  marketSession?: string | null;
  haltStatus?: StrategyEvalFacts["haltStatus"];
  resumptionFlag?: boolean;
  dilutionFlags?: string[];
  riskFlags?: string[];
  sector?: string | null;
  exchange?: string | null;
  catalystAgeMin?: number | null;
  strategyMatchHint?: boolean;
}

export function monitorPresetCatalog(): Array<{
  id: StrategyPresetId;
  label: string;
  blurb: string;
}> {
  return STRATEGY_PRESET_META.filter((p) =>
    MONITOR_PRESET_IDS.includes(p.id)
  ).map((p) => ({ id: p.id, label: p.label, blurb: p.blurb }));
}

/** Fresh template — never an in-place edit of a saved row. */
export function instantiateMonitorPreset(
  presetId: StrategyPresetId
): {
  strategy: AlertStrategy;
  summary: ReturnType<typeof summarizeMonitorPreset>;
  issues: StrategyValidationIssue[];
  contentHash: string;
} {
  const strategy = buildPreset(presetId);
  const validation = validateStrategy(strategy);
  return {
    strategy,
    summary: summarizeMonitorPreset(strategy),
    issues: validation.issues,
    contentHash: strategyContentHash(strategy),
  };
}

export function factsFromMonitorSymbol(
  input: MonitorSymbolFactsInput
): StrategyEvalFacts {
  const riskFlags = [
    ...(input.riskFlags ?? []),
    ...(input.dilutionFlags ?? []),
  ].map((r) => r.toLowerCase());

  return {
    symbol: input.symbol.toUpperCase(),
    onWatchlist: input.onWatchlist,
    price: input.price ?? null,
    floatM: input.floatM ?? null,
    floatConfidence: input.floatConfidence ?? null,
    marketCapM: input.marketCapM ?? null,
    catalystCategory: input.catalystCategory ?? null,
    sourceTier: input.sourceTier ?? null,
    sourceVerification: input.sourceVerification ?? null,
    confirmationCount: input.confirmationCount ?? null,
    catalystStrength: null,
    reactionStage: null,
    relativeVolume: input.relativeVolume ?? null,
    dollarVolume: input.dollarVolume ?? null,
    dollarVolumeVelocity: input.dollarVolumeVelocity ?? null,
    tradesPerSecond: input.tradesPerSecond ?? null,
    pctMove: input.sessionChangePct ?? null,
    spreadBps: input.spreadBps ?? null,
    tradeability: input.tradeability ?? null,
    dilutionFlags: input.dilutionFlags ?? [],
    riskFlags,
    marketSession: input.marketSession ?? "regular",
    haltStatus: input.haltStatus ?? (input.momentumState === "HALTED" ? "halted" : "trading"),
    resumptionFlag: input.resumptionFlag ?? false,
    momentumState: input.momentumState?.toUpperCase() ?? null,
    momentumIntensity: input.momentumIntensity ?? null,
    attentionPriority: input.attentionPriority ?? null,
    catalystAgeMin: input.catalystAgeMin ?? null,
    sector: input.sector ?? null,
    exchange: input.exchange ?? null,
  };
}

export function evaluateMonitorPreset(
  strategy: AlertStrategy,
  facts: StrategyEvalFacts
): { matched: boolean; explain: StrategyExplainResult } {
  const result = evaluateStrategy(strategy, facts, null, {
    skipDeliveryMode: true,
  });
  const explain = explainStrategyMatch(strategy, facts, null, {
    nowMs: Date.now(),
  });
  // Re-align wouldAlert with skipDeliveryMode inspection match
  return {
    matched: result.matched,
    explain: {
      ...explain,
      wouldAlert: result.matched,
      why: result.matched
        ? result.details.filter((d) => d.passed).map((d) => `${d.field}: ${d.detail}`)
        : explain.why,
      whyNot: result.matched
        ? []
        : result.details
            .filter((d) => !d.passed)
            .map((d) => `${d.field}: ${d.detail}`),
      details: result.details,
    },
  };
}

export function explainWhyTickerMatched(
  strategy: AlertStrategy,
  facts: StrategyEvalFacts
): string[] {
  const { matched, explain } = evaluateMonitorPreset(strategy, facts);
  if (!matched) return [];
  return explain.why.length
    ? explain.why
    : [`Matched preset “${strategy.name}” (v${strategy.version}).`];
}

export function explainWhyTickerDidNotMatch(
  strategy: AlertStrategy,
  facts: StrategyEvalFacts
): string[] {
  const { matched, explain } = evaluateMonitorPreset(strategy, facts);
  if (matched) return [];
  return explain.whyNot.length
    ? explain.whyNot
    : [`Did not match preset “${strategy.name}”.`];
}

export function filterSymbolsByMonitorPreset<T extends { symbol: string }>(
  rows: T[],
  strategy: AlertStrategy | null,
  factsFor: (row: T) => StrategyEvalFacts
): Array<T & { presetMatched: boolean; matchReasons: string[] }> {
  if (!strategy) {
    return rows.map((r) => ({
      ...r,
      presetMatched: true,
      matchReasons: ["No preset active"],
    }));
  }
  return rows.map((row) => {
    const facts = factsFor(row);
    const { matched, explain } = evaluateMonitorPreset(strategy, facts);
    return {
      ...row,
      presetMatched: matched,
      matchReasons: matched
        ? explain.why
        : [],
    };
  });
}

/** Historical replay preview — same simulator, inspection-oriented disclaimer. */
export function replayMonitorPresetPreview(
  strategy: AlertStrategy,
  rows: SimulationCatalystRow[],
  opts?: { watchlistSymbols?: string[] }
) {
  const sim = simulateStrategy(strategy, rows, {
    watchlistSymbols: opts?.watchlistSymbols,
    skipDeliveryMode: true,
    maxSample: 200,
  });
  return {
    ...sim,
    plainSummary: summarizeMonitorPreset(strategy).headline,
    limitations: [
      ...sim.limitations,
      "Monitor preset replay is an inspection preview — not a live quote-by-quote tape reconstruction.",
      "Private strategy condition trees are not written to analytics.",
    ],
  };
}

export function assertPresetNotSilentlyMutated(
  saved: AlertStrategy,
  candidate: AlertStrategy
): { ok: boolean; reason: string | null } {
  if (saved.id !== candidate.id) {
    return { ok: true, reason: null };
  }
  if (saved.version !== candidate.version) {
    return {
      ok: false,
      reason: `Version mismatch (saved v${saved.version}, candidate v${candidate.version}). Reload — presets are never changed silently.`,
    };
  }
  if (strategyContentHash(saved) !== strategyContentHash(candidate)) {
    return {
      ok: false,
      reason:
        "Content hash mismatch without a version bump. Explicit save required — silent edits are refused.",
    };
  }
  return { ok: true, reason: null };
}
