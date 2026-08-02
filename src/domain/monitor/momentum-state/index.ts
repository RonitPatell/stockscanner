export { MONITOR_MOMENTUM_STATE_VERSION } from "./version.ts";

export { resolveThresholds } from "./config.ts";
export {
  ALL_STATES,
  PROHIBITED_EXAMPLES,
  isPermittedTransition,
  permittedTargets,
  assertProhibited,
} from "./transitions.ts";
export { proposeState } from "./propose.ts";
export { explainState } from "./explain.ts";
export {
  stepMachine,
  createMemory,
  seedMemory,
  canTransition,
} from "./machine.ts";
export type { SymbolMachineMemory } from "./machine.ts";
export {
  MomentumStateMachineEngine,
} from "./engine.ts";
export type { MomentumLifecycleView, MomentumStateEngineOptions } from "./engine.ts";

export type {
  MomentumLifecycleState,
  PriceDirection,
  HodLodInteraction,
  MomentumStateInput,
  TransitionEvidence,
  MomentumStateTransition,
  MomentumStateSnapshot,
  StateThresholds,
  LiquidityCohort,
} from "./types.ts";
