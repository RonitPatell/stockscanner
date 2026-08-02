import { mergeLeaderConfig } from "./config.ts";
import {
  applyPin,
  emptyLeaderState,
  selectLeader,
} from "./leader.ts";
import { scoreAttention } from "./score.ts";
import { LeaderTransitionStore } from "./transition-store.ts";
import type {
  AttentionCandidateInput,
  AttentionEngineOptions,
  AttentionScore,
  AttentionVariant,
  LeaderSelectionConfig,
  LeaderState,
  LeaderTransition,
  RankSnapshot,
  RankedCandidate,
} from "./types.ts";
import { MONITOR_ATTENTION_VERSION } from "./version.ts";

interface ScopeKey {
  variant: AttentionVariant;
  userScopeId: string | null;
}

function scopeId(s: ScopeKey): string {
  return s.variant === "global"
    ? "global"
    : `user:${s.userScopeId ?? "anon"}`;
}

/**
 * Attention Priority Engine — inspection order only.
 * Never implies trade entry.
 */
export class AttentionPriorityEngine {
  readonly version = MONITOR_ATTENTION_VERSION;
  private readonly leaderCfg: LeaderSelectionConfig;
  private readonly topN: number;
  private readonly rankHistoryDepth: number;
  private readonly nowFn: () => number;
  private readonly leaders = new Map<string, LeaderState>();
  private readonly rankHistory = new Map<string, number[]>(); // key = scope|SYMBOL
  private readonly lastRanks = new Map<string, Map<string, number>>();
  private readonly transitions: LeaderTransitionStore;

  constructor(opts: AttentionEngineOptions = {}) {
    this.leaderCfg = mergeLeaderConfig(opts.leader);
    this.topN = opts.topN ?? 10;
    this.rankHistoryDepth = opts.rankHistoryDepth ?? 8;
    this.nowFn = opts.now ?? (() => Date.now());
    this.transitions = new LeaderTransitionStore(opts.maxTransitions ?? 500);
  }

  leaderConfig(): LeaderSelectionConfig {
    return { ...this.leaderCfg };
  }

  /**
   * Score + rank candidates for a variant; update leader with anti-flap rules.
   */
  evaluate(input: {
    candidates: AttentionCandidateInput[];
    variant: AttentionVariant;
    userScopeId?: string | null;
    nowMs?: number;
  }): {
    scores: AttentionScore[];
    top10: RankedCandidate[];
    leader: LeaderState;
    transition: LeaderTransition | null;
    rankSnapshot: RankSnapshot;
  } {
    const nowMs = input.nowMs ?? this.nowFn();
    const userScopeId =
      input.variant === "user" ? (input.userScopeId ?? "user") : null;
    const sk: ScopeKey = { variant: input.variant, userScopeId };
    const sid = scopeId(sk);

    // Inject recent ranks into candidates when engine has history.
    const enriched = input.candidates.map((c) => {
      const sym = c.symbol.toUpperCase();
      const histKey = `${sid}|${sym}`;
      const recent = this.rankHistory.get(histKey) ?? c.recentRanks ?? null;
      return { ...c, symbol: sym, recentRanks: recent };
    });

    const scores = enriched
      .map((candidate) =>
        scoreAttention({
          candidate,
          variant: input.variant,
          userScopeId,
          leaderConfig: this.leaderCfg,
          nowMs,
        })
      )
      .sort((a, b) => {
        if (b.attentionPriority !== a.attentionPriority) {
          return b.attentionPriority - a.attentionPriority;
        }
        return a.symbol.localeCompare(b.symbol);
      });

    const prevMap = this.lastRanks.get(sid) ?? new Map();
    const top10: RankedCandidate[] = scores.slice(0, this.topN).map((score, i) => {
      const rank = i + 1;
      const prev = prevMap.get(score.symbol);
      return {
        rank,
        score,
        rankDelta: prev != null ? rank - prev : null,
      };
    });

    // Update rank history (per symbol).
    const nextMap = new Map<string, number>();
    for (let i = 0; i < scores.length; i++) {
      const s = scores[i]!;
      const rank = i + 1;
      nextMap.set(s.symbol, rank);
      const histKey = `${sid}|${s.symbol}`;
      const arr = this.rankHistory.get(histKey) ?? [];
      arr.push(rank);
      while (arr.length > this.rankHistoryDepth) arr.shift();
      this.rankHistory.set(histKey, arr);
    }
    this.lastRanks.set(sid, nextMap);

    let leader = this.leaders.get(sid) ?? emptyLeaderState(input.variant, userScopeId);
    const sel = selectLeader({
      state: leader,
      ranked: scores,
      config: this.leaderCfg,
      nowMs,
    });
    leader = sel.state;
    this.leaders.set(sid, leader);
    if (sel.transition) this.transitions.push(sel.transition);

    const rankSnapshot: RankSnapshot = {
      variant: input.variant,
      userScopeId,
      asOfMs: nowMs,
      calcVersion: MONITOR_ATTENTION_VERSION,
      top: top10,
    };

    return {
      scores,
      top10,
      leader,
      transition: sel.transition,
      rankSnapshot,
    };
  }

  /** Convenience: evaluate both global and user variants. */
  evaluateBoth(input: {
    candidates: AttentionCandidateInput[];
    userScopeId: string;
    nowMs?: number;
  }): {
    global: ReturnType<AttentionPriorityEngine["evaluate"]>;
    user: ReturnType<AttentionPriorityEngine["evaluate"]>;
  } {
    const nowMs = input.nowMs ?? this.nowFn();
    return {
      global: this.evaluate({
        candidates: input.candidates,
        variant: "global",
        nowMs,
      }),
      user: this.evaluate({
        candidates: input.candidates,
        variant: "user",
        userScopeId: input.userScopeId,
        nowMs,
      }),
    };
  }

  getLeader(variant: AttentionVariant, userScopeId?: string | null): LeaderState {
    const sid = scopeId({
      variant,
      userScopeId: variant === "user" ? (userScopeId ?? "user") : null,
    });
    return (
      this.leaders.get(sid) ??
      emptyLeaderState(
        variant,
        variant === "user" ? (userScopeId ?? "user") : null
      )
    );
  }

  pin(
    symbol: string | null,
    opts: { variant: AttentionVariant; userScopeId?: string | null }
  ): LeaderTransition | null {
    const nowMs = this.nowFn();
    const userScopeId =
      opts.variant === "user" ? (opts.userScopeId ?? "user") : null;
    const sid = scopeId({ variant: opts.variant, userScopeId });
    const cur =
      this.leaders.get(sid) ?? emptyLeaderState(opts.variant, userScopeId);
    const { state, transition } = applyPin(cur, symbol, nowMs);
    this.leaders.set(sid, state);
    if (transition) this.transitions.push(transition);
    return transition;
  }

  unpin(opts: { variant: AttentionVariant; userScopeId?: string | null }): void {
    this.pin(null, opts);
  }

  listTransitions(opts?: {
    variant?: AttentionVariant;
    userScopeId?: string | null;
    limit?: number;
  }): LeaderTransition[] {
    return this.transitions.list(opts);
  }

  rankHistoryFor(
    symbol: string,
    variant: AttentionVariant,
    userScopeId?: string | null
  ): number[] {
    const sid = scopeId({
      variant,
      userScopeId: variant === "user" ? (userScopeId ?? "user") : null,
    });
    return [...(this.rankHistory.get(`${sid}|${symbol.toUpperCase()}`) ?? [])];
  }
}
