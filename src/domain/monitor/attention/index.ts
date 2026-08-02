export { MONITOR_ATTENTION_VERSION } from "./version.ts";

export {
  DEFAULT_LEADER_CONFIG,
  mergeLeaderConfig,
  sessionAttentionMult,
  clamp100,
  tierFromPriority,
} from "./config.ts";

export { scoreAttention } from "./score.ts";
export {
  selectLeader,
  applyPin,
  emptyLeaderState,
} from "./leader.ts";
export type { LeaderUpdateResult } from "./leader.ts";

export { AttentionPriorityEngine } from "./engine.ts";
export { LeaderTransitionStore } from "./transition-store.ts";

export type {
  AttentionVariant,
  PriorityTier,
  DataConfidence,
  ReactionStage,
  HaltLifecycleHint,
  AttentionReasonCode,
  AttentionReason,
  AttentionCandidateInput,
  AttentionScore,
  RankedCandidate,
  RankSnapshot,
  LeaderState,
  LeaderTransition,
  LeaderSelectionConfig,
  AttentionEngineOptions,
} from "./types.ts";
