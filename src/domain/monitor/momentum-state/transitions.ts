import type { MomentumLifecycleState } from "./types.ts";

/**
 * Permitted directed edges (excluding universal overrides).
 * HALTED and UNKNOWN are handled as overrides in the machine:
 * - HALTED ← any
 * - UNKNOWN ← any (when critical data stale / post-halt unreliable)
 * - HALTED → UNKNOWN (before reliable resumption)
 * - UNKNOWN → calculated states when data fresh (via matrix below from UNKNOWN)
 */
const PERMITTED: Record<MomentumLifecycleState, MomentumLifecycleState[]> = {
  DORMANT: ["EMERGING", "HALTED", "UNKNOWN"],
  EMERGING: ["BUILDING", "DORMANT", "HALTED", "UNKNOWN"],
  BUILDING: ["BREAKING", "EMERGING", "COOLING", "HALTED", "UNKNOWN"],
  BREAKING: ["ACTIVE", "BUILDING", "COOLING", "HALTED", "UNKNOWN"],
  ACTIVE: ["COOLING", "BREAKING", "HALTED", "UNKNOWN"],
  COOLING: ["RECLAIMING", "FADING", "ACTIVE", "HALTED", "UNKNOWN"],
  FADING: ["DORMANT", "RECLAIMING", "HALTED", "UNKNOWN"],
  RECLAIMING: ["BUILDING", "ACTIVE", "COOLING", "FADING", "HALTED", "UNKNOWN"],
  // Reliable resumption never jumps straight to ACTIVE/BREAKING.
  HALTED: ["UNKNOWN", "HALTED"],
  UNKNOWN: [
    "DORMANT",
    "EMERGING",
    "BUILDING",
    "COOLING",
    "FADING",
    "HALTED",
    "UNKNOWN",
  ],
};

export const ALL_STATES: MomentumLifecycleState[] = [
  "DORMANT",
  "EMERGING",
  "BUILDING",
  "BREAKING",
  "ACTIVE",
  "COOLING",
  "FADING",
  "RECLAIMING",
  "HALTED",
  "UNKNOWN",
];

export function isPermittedTransition(
  from: MomentumLifecycleState | null,
  to: MomentumLifecycleState
): boolean {
  if (from == null) return true; // initial assignment
  if (from === to) return true;
  // Universal: any → HALTED, any → UNKNOWN
  if (to === "HALTED" || to === "UNKNOWN") return true;
  return PERMITTED[from].includes(to);
}

export function permittedTargets(
  from: MomentumLifecycleState
): MomentumLifecycleState[] {
  const set = new Set<MomentumLifecycleState>([...PERMITTED[from], "HALTED", "UNKNOWN"]);
  return [...set];
}

/** Explicit prohibited edges used in tests / docs (non-exhaustive of complement). */
export const PROHIBITED_EXAMPLES: Array<{
  from: MomentumLifecycleState;
  to: MomentumLifecycleState;
  reason: string;
}> = [
  { from: "DORMANT", to: "ACTIVE", reason: "Cannot skip EMERGING/BUILDING/BREAKING" },
  { from: "DORMANT", to: "BREAKING", reason: "Cannot skip build-up" },
  { from: "EMERGING", to: "ACTIVE", reason: "Cannot skip BUILDING/BREAKING" },
  { from: "EMERGING", to: "BREAKING", reason: "Cannot skip BUILDING" },
  { from: "BUILDING", to: "ACTIVE", reason: "Must pass BREAKING" },
  { from: "FADING", to: "BREAKING", reason: "Fading cannot jump to breaking" },
  { from: "FADING", to: "ACTIVE", reason: "Fading cannot jump to active" },
  { from: "HALTED", to: "ACTIVE", reason: "Halt must clear via UNKNOWN first" },
  { from: "HALTED", to: "BREAKING", reason: "Halt must clear via UNKNOWN first" },
  { from: "HALTED", to: "EMERGING", reason: "Halt must clear via UNKNOWN before resume path" },
  { from: "UNKNOWN", to: "BREAKING", reason: "Unknown cannot enter BREAKING directly" },
  { from: "UNKNOWN", to: "ACTIVE", reason: "Unknown cannot enter ACTIVE directly" },
  { from: "ACTIVE", to: "DORMANT", reason: "Must cool/fade first" },
  { from: "BREAKING", to: "DORMANT", reason: "Must cool/fade path" },
  { from: "RECLAIMING", to: "BREAKING", reason: "Reclaim goes BUILDING/ACTIVE not BREAKING" },
];

export function assertProhibited(
  from: MomentumLifecycleState,
  to: MomentumLifecycleState
): boolean {
  return !isPermittedTransition(from, to);
}
