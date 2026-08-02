import type {
  AttentionScore,
  LeaderSelectionConfig,
  LeaderState,
  LeaderTransition,
} from "./types.ts";
import { MONITOR_ATTENTION_VERSION } from "./version.ts";

export function emptyLeaderState(
  variant: LeaderState["variant"],
  userScopeId: string | null
): LeaderState {
  return {
    variant,
    userScopeId,
    symbol: null,
    score: null,
    sinceMs: null,
    challengerSymbol: null,
    challengerScore: null,
    challengerSinceMs: null,
    pinned: false,
    pinnedSymbol: null,
    warnings: [],
    calcVersion: MONITOR_ATTENTION_VERSION,
  };
}

export interface LeaderUpdateResult {
  state: LeaderState;
  transition: LeaderTransition | null;
  topSymbol: string | null;
}

/**
 * Apply anti-flap leader selection.
 * Pin disables automatic selection. Critical bypass may skip hysteresis.
 * Stale/low-confidence candidates cannot become leader unless bypass+warning.
 */
export function selectLeader(input: {
  state: LeaderState;
  ranked: AttentionScore[];
  config: LeaderSelectionConfig;
  nowMs: number;
}): LeaderUpdateResult {
  const { config, nowMs } = input;
  const state: LeaderState = { ...input.state, warnings: [...input.state.warnings] };
  state.calcVersion = MONITOR_ATTENTION_VERSION;

  // Pin wins — automatic selection disabled.
  if (state.pinned && state.pinnedSymbol) {
    const pinnedScore =
      input.ranked.find((r) => r.symbol === state.pinnedSymbol) ?? null;
    state.symbol = state.pinnedSymbol;
    state.score = pinnedScore?.attentionPriority ?? state.score;
    state.warnings = pinnedScore?.warnings ?? [];
    if (pinnedScore && !pinnedScore.eligibleForLeader) {
      if (!state.warnings.includes("Pinned ticker has stale or low-confidence data")) {
        state.warnings.push("Pinned ticker has stale or low-confidence data");
      }
    }
    return {
      state,
      transition: null,
      topSymbol: state.pinnedSymbol,
    };
  }

  const eligible = input.ranked.filter((r) => r.eligibleForLeader);
  const best =
    eligible[0] ??
    // Fall back to top ranked only with forced warning (never silent).
    (input.ranked[0]
      ? {
          ...input.ranked[0],
          warnings: [
            ...input.ranked[0].warnings,
            "Leader forced from ineligible pool — explicit stale/low-confidence warning",
          ],
        }
      : null);

  if (!best) {
    return { state, transition: null, topSymbol: state.symbol };
  }

  // No current leader → take best immediately.
  if (!state.symbol) {
    return commit(state, null, best, nowMs, "initial_leader", false);
  }

  if (best.symbol === state.symbol) {
    state.score = best.attentionPriority;
    state.challengerSymbol = null;
    state.challengerScore = null;
    state.challengerSinceMs = null;
    state.warnings = best.warnings;
    return { state, transition: null, topSymbol: state.symbol };
  }

  const leaderHoldOk =
    state.sinceMs == null ||
    nowMs - state.sinceMs >= config.minLeaderHoldMs;

  const margin = best.attentionPriority - (state.score ?? 0);
  // Score layer sets criticalBypass for halt/resumption/dilution/regulatory
  // and for fresh highly-material verified catalysts.
  if (best.criticalBypass && margin > 0) {
    return commit(
      state,
      state.symbol,
      best,
      nowMs,
      "critical_bypass",
      true
    );
  }

  if (!leaderHoldOk) {
    // Still in min hold — track challenger but do not switch.
    trackChallenger(state, best, nowMs, margin, config);
    return { state, transition: null, topSymbol: state.symbol };
  }

  if (margin < config.challengeMargin) {
    // Not enough margin — clear challenger if different.
    if (state.challengerSymbol !== best.symbol) {
      state.challengerSymbol = null;
      state.challengerScore = null;
      state.challengerSinceMs = null;
    }
    return { state, transition: null, topSymbol: state.symbol };
  }

  // Margin met — require persistence.
  if (
    state.challengerSymbol === best.symbol &&
    state.challengerSinceMs != null &&
    nowMs - state.challengerSinceMs >= config.challengeHoldMs &&
    (state.challengerScore ?? 0) >= (state.score ?? 0) + config.challengeMargin
  ) {
    return commit(
      state,
      state.symbol,
      best,
      nowMs,
      "challenge_margin_held",
      false
    );
  }

  trackChallenger(state, best, nowMs, margin, config);
  return { state, transition: null, topSymbol: state.symbol };
}

function trackChallenger(
  state: LeaderState,
  best: AttentionScore,
  nowMs: number,
  margin: number,
  config: LeaderSelectionConfig
): void {
  if (margin < config.challengeMargin) return;
  if (state.challengerSymbol !== best.symbol) {
    state.challengerSymbol = best.symbol;
    state.challengerScore = best.attentionPriority;
    state.challengerSinceMs = nowMs;
  } else {
    state.challengerScore = best.attentionPriority;
    // keep sinceMs
  }
}

function commit(
  state: LeaderState,
  previous: string | null,
  best: AttentionScore,
  nowMs: number,
  reason: string,
  bypass: boolean
): LeaderUpdateResult {
  const prevScore = state.score;
  const transition: LeaderTransition = {
    previousSymbol: previous,
    newSymbol: best.symbol,
    reason,
    previousScore: prevScore,
    newScore: best.attentionPriority,
    timestamp: new Date(nowMs).toISOString(),
    timestampMs: nowMs,
    calcVersion: MONITOR_ATTENTION_VERSION,
    variant: state.variant,
    userScopeId: state.userScopeId,
    bypass,
    pinned: false,
  };
  state.symbol = best.symbol;
  state.score = best.attentionPriority;
  state.sinceMs = nowMs;
  state.challengerSymbol = null;
  state.challengerScore = null;
  state.challengerSinceMs = null;
  state.warnings = [...best.warnings];
  return { state, transition, topSymbol: best.symbol };
}

export function applyPin(
  state: LeaderState,
  symbol: string | null,
  nowMs: number
): { state: LeaderState; transition: LeaderTransition | null } {
  const next = { ...state, warnings: [...state.warnings] };
  if (symbol == null) {
    next.pinned = false;
    next.pinnedSymbol = null;
    // Clear leader so the next evaluate re-selects automatically (no pin lock).
    next.symbol = null;
    next.score = null;
    next.sinceMs = null;
    next.challengerSymbol = null;
    next.challengerScore = null;
    next.challengerSinceMs = null;
    return { state: next, transition: null };
  }
  const sym = symbol.toUpperCase();
  const prev = next.symbol;
  next.pinned = true;
  next.pinnedSymbol = sym;
  next.symbol = sym;
  next.sinceMs = nowMs;
  next.challengerSymbol = null;
  next.challengerScore = null;
  next.challengerSinceMs = null;
  const transition: LeaderTransition = {
    previousSymbol: prev,
    newSymbol: sym,
    reason: "user_pin",
    previousScore: next.score,
    newScore: next.score ?? 0,
    timestamp: new Date(nowMs).toISOString(),
    timestampMs: nowMs,
    calcVersion: MONITOR_ATTENTION_VERSION,
    variant: next.variant,
    userScopeId: next.userScopeId,
    bypass: true,
    pinned: true,
  };
  return { state: next, transition };
}
