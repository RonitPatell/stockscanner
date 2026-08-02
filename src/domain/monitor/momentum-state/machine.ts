import { resolveThresholds } from "./config.ts";
import { explainState } from "./explain.ts";
import { proposeState } from "./propose.ts";
import { isPermittedTransition } from "./transitions.ts";
import type {
  MomentumLifecycleState,
  MomentumStateInput,
  MomentumStateSnapshot,
  MomentumStateTransition,
  TransitionEvidence,
} from "./types.ts";
import { MONITOR_MOMENTUM_STATE_VERSION } from "./version.ts";

export interface SymbolMachineMemory {
  state: MomentumLifecycleState | null;
  sinceMs: number;
  lastAsOfMs: number;
  lastIntensity: number | null;
  lastTransition: MomentumStateTransition | null;
}

export function createMemory(): SymbolMachineMemory {
  return {
    state: null,
    sinceMs: 0,
    lastAsOfMs: 0,
    lastIntensity: null,
    lastTransition: null,
  };
}

/** Seed memory for fixtures / transition path tests. */
export function seedMemory(
  state: MomentumLifecycleState,
  atMs: number,
  lastIntensity: number | null = 40
): SymbolMachineMemory {
  return {
    state,
    sinceMs: atMs,
    lastAsOfMs: atMs,
    lastIntensity,
    lastTransition: null,
  };
}

/**
 * One incremental step. Rejects future-inconsistent samples (asOfMs < lastAsOfMs).
 * HALTED overrides all. UNKNOWN overrides calculated states when data is stale
 * or post-halt resumption data is unreliable.
 */
export function stepMachine(
  memory: SymbolMachineMemory,
  input: MomentumStateInput
): {
  snapshot: MomentumStateSnapshot;
  transition: MomentumStateTransition | null;
  memory: SymbolMachineMemory;
} {
  // No future data / no time travel.
  if (memory.lastAsOfMs > 0 && input.asOfMs < memory.lastAsOfMs) {
    const state = memory.state ?? "UNKNOWN";
    const evidence: TransitionEvidence[] = [
      {
        code: "reject_out_of_order",
        detail:
          "Sample asOfMs earlier than last accepted — ignored for transition",
        value: input.asOfMs,
      },
    ];
    const snap: MomentumStateSnapshot = {
      symbol: input.symbol.toUpperCase(),
      state,
      previousState: memory.lastTransition?.from ?? null,
      sinceMs: memory.sinceMs,
      asOfMs: memory.lastAsOfMs,
      calcVersion: MONITOR_MOMENTUM_STATE_VERSION,
      explanation: explainState(state, evidence),
      evidence,
      session: input.session,
      liquidityCohort: input.liquidityCohort,
      proposedState: state,
      dwellRemainingMs: 0,
    };
    return { snapshot: snap, transition: null, memory };
  }

  const thresholds = resolveThresholds(input.session, input.liquidityCohort);
  const evidence: TransitionEvidence[] = [];

  const slope = resolveSlope(memory, input);
  const stale =
    input.sourceDataAgeMs != null &&
    input.sourceDataAgeMs > thresholds.staleMs;

  // --- Overrides (highest priority) ---
  let proposed: MomentumLifecycleState;
  if (input.halted) {
    proposed = "HALTED";
    evidence.push({
      code: "override_halt",
      detail: "HALTED overrides every other state",
      value: true,
    });
  } else if (
    memory.state === "HALTED" &&
    !input.resumptionDataReliable
  ) {
    // After halt clears, require UNKNOWN until resumption data is reliable.
    proposed = "UNKNOWN";
    evidence.push({
      code: "override_post_halt",
      detail:
        "Halt cleared but resumption data not yet reliable — UNKNOWN before calculated states",
    });
  } else if (stale || input.momentumIntensity == null) {
    proposed = "UNKNOWN";
    evidence.push({
      code: "override_stale",
      detail: stale
        ? `Critical data stale (${input.sourceDataAgeMs}ms > ${thresholds.staleMs}ms)`
        : "Momentum intensity missing",
      value: input.sourceDataAgeMs,
    });
  } else {
    const p = proposeState(input, thresholds, memory.state, slope);
    proposed = p.state;
    evidence.push(...p.evidence);
  }

  const current = memory.state;
  let next = proposed;
  let trigger = "hold";
  let transition: MomentumStateTransition | null = null;

  if (current == null) {
    next = proposed;
    trigger = "initial";
  } else if (proposed === current) {
    next = current;
    trigger = "hold";
  } else if (!isPermittedTransition(current, proposed)) {
    // Illegal edge — stay put (unless override to HALTED/UNKNOWN already permitted).
    next = current;
    trigger = "prohibited_blocked";
    evidence.push({
      code: "prohibited_transition",
      detail: `Blocked ${current} → ${proposed}`,
    });
  } else {
    const dwell = thresholds.dwellMs[current] ?? 0;
    const elapsed = input.asOfMs - memory.sinceMs;
    const override =
      proposed === "HALTED" ||
      proposed === "UNKNOWN" ||
      (current === "HALTED" && proposed === "UNKNOWN");

    if (!override && dwell > 0 && elapsed < dwell) {
      next = current;
      trigger = "dwell_hold";
      evidence.push({
        code: "dwell_hold",
        detail: `Minimum dwell ${dwell}ms not met (${elapsed}ms elapsed)`,
        value: dwell - elapsed,
      });
    } else {
      next = proposed;
      trigger = override
        ? proposed === "HALTED"
          ? "override_halt"
          : "override_unknown"
        : `transition_${current}_to_${proposed}`;
    }
  }

  const nextMem: SymbolMachineMemory = {
    state: next,
    sinceMs:
      next !== current || current == null
        ? input.asOfMs
        : memory.sinceMs || input.asOfMs,
    lastAsOfMs: input.asOfMs,
    lastIntensity: input.momentumIntensity,
    lastTransition: memory.lastTransition,
  };

  if (next !== current) {
    transition = {
      symbol: input.symbol.toUpperCase(),
      from: current,
      to: next,
      atMs: input.asOfMs,
      atIso: new Date(input.asOfMs).toISOString(),
      calcVersion: MONITOR_MOMENTUM_STATE_VERSION,
      evidence: [...evidence],
      trigger,
    };
    nextMem.lastTransition = transition;
  }

  const dwellReq = thresholds.dwellMs[next] ?? 0;
  const dwellRemaining = Math.max(
    0,
    dwellReq - (input.asOfMs - nextMem.sinceMs)
  );

  const snapshot: MomentumStateSnapshot = {
    symbol: input.symbol.toUpperCase(),
    state: next,
    previousState: next !== current ? current : memory.lastTransition?.from ?? null,
    sinceMs: nextMem.sinceMs,
    asOfMs: input.asOfMs,
    calcVersion: MONITOR_MOMENTUM_STATE_VERSION,
    explanation: explainState(next, evidence),
    evidence,
    session: input.session,
    liquidityCohort: input.liquidityCohort,
    proposedState: proposed,
    dwellRemainingMs: dwellRemaining,
  };

  return { snapshot, transition, memory: nextMem };
}

function resolveSlope(
  memory: SymbolMachineMemory,
  input: MomentumStateInput
): number {
  if (
    input.momentumIntensitySlope != null &&
    Number.isFinite(input.momentumIntensitySlope)
  ) {
    return input.momentumIntensitySlope;
  }
  if (
    input.momentumIntensity != null &&
    memory.lastIntensity != null &&
    memory.lastAsOfMs > 0 &&
    input.asOfMs > memory.lastAsOfMs
  ) {
    const dt = (input.asOfMs - memory.lastAsOfMs) / 1000;
    if (dt > 0) {
      return (input.momentumIntensity - memory.lastIntensity) / dt;
    }
  }
  return 0;
}

/** Test helper: force-attempt a transition edge against the matrix. */
export function canTransition(
  from: MomentumLifecycleState,
  to: MomentumLifecycleState
): boolean {
  return isPermittedTransition(from, to);
}
